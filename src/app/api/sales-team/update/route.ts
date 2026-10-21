import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * Canonicalize role so "sales", "Sales", "TEAM LEAD-SALES", etc. all land
 * on one of the two accepted strings.
 */
function canonicalRole(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (lower === "sales" || lower === "sale") return "Sales";
  if (
    lower === "team lead-sales" ||
    lower === "team lead sales" ||
    lower === "teamlead-sales" ||
    lower === "team-lead-sales"
  ) {
    return "Team Lead-Sales";
  }
  // Pass through anything else as-is (e.g. "Graphic Designer")
  return t;
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      periodId,
      employeeName,
      role,
      basicSalary,
      individualSales,
      saleBase,
      commissionRate,
      commissionAmt,
      netPayable,
      amountPaid,
      remaining,
      status,
      notes,
    } = body;

    if (!periodId || !employeeName) {
      return NextResponse.json(
        { error: "periodId and employeeName required" },
        { status: 400 }
      );
    }

    const cleanName = String(employeeName).trim();

    // Look up employee case-insensitively and trimmed, so a stray space or a
    // different casing in the row never blocks the save.
    const emp = await prisma.employee.findFirst({
      where: { name: { equals: cleanName, mode: "insensitive" } },
    });
    if (!emp) {
      return NextResponse.json(
        { error: `Employee "${cleanName}" not found in Employees` },
        { status: 404 }
      );
    }

    // â”€â”€ Update the Employee master (role + basic salary) â”€â”€
    const nextRole = canonicalRole(role) ?? emp.role ?? "Sales";
    const employeeUpdate: Record<string, unknown> = { role: nextRole };
    if (basicSalary != null && !Number.isNaN(Number(basicSalary))) {
      employeeUpdate.basicSalary = Number(basicSalary) || 0;
    }
    await prisma.employee.update({
      where: { id: emp.id },
      data: employeeUpdate as never,
    });

    // â”€â”€ Commission row â”€â”€
    const saleAmt =
      saleBase != null
        ? Number(saleBase) || 0
        : individualSales != null
          ? Number(individualSales) || 0
          : 0;
    const rate =
      commissionRate != null && !Number.isNaN(Number(commissionRate))
        ? Number(commissionRate)
        : 2.5;
    const commAmt =
      commissionAmt != null && !Number.isNaN(Number(commissionAmt))
        ? Number(commissionAmt)
        : saleAmt * (rate / 100);

    const existingComm = await prisma.commission.findFirst({
      where: { periodId, employeeName: emp.name },
    });
    if (existingComm) {
      await prisma.commission.update({
        where: { id: existingComm.id },
        data: {
          saleAmount: saleAmt,
          commissionRate: rate,
          commissionAmt: commAmt,
          status: status === "Paid" ? "Paid" : "Accrued",
          notes: notes != null ? notes : existingComm.notes,
        },
      });
    } else {
      await prisma.commission.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          saleAmount: saleAmt,
          commissionRate: rate,
          commissionAmt: commAmt,
          status: status === "Paid" ? "Paid" : "Accrued",
          notes: notes || null,
        },
      });
    }

    // â”€â”€ Payroll row â”€â”€
    const existingPay = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName: emp.name },
    });

    const basic =
      basicSalary != null
        ? Number(basicSalary) || 0
        : existingPay?.basicSalary ?? emp.basicSalary ?? 0;
    const loan = existingPay?.loanInstallment ?? 0;
    const tax = existingPay?.taxDeducted ?? 0;
    const other = existingPay?.otherDeductions ?? 0;

    const computedNet = Math.max(0, basic + commAmt - tax - loan - other);
    const net =
      netPayable != null && !Number.isNaN(Number(netPayable))
        ? Number(netPayable)
        : computedNet;

    const paid =
      amountPaid != null ? Number(amountPaid) || 0 : existingPay?.amountPaid ?? 0;
    const rem =
      remaining != null && !Number.isNaN(Number(remaining))
        ? Math.max(0, Number(remaining))
        : Math.max(0, net - paid);

    let nextStatus: string;
    if (status) nextStatus = status;
    else if (rem <= 0 && paid > 0) nextStatus = "Paid";
    else if (paid > 0) nextStatus = "Partial";
    else nextStatus = "Pending";

    if (existingPay) {
      await prisma.payrollEntry.update({
        where: { id: existingPay.id },
        data: {
          basicSalary: basic,
          netPayable: net,
          amountPaid: paid,
          remaining: rem,
          status: nextStatus,
          notes: notes != null ? notes : existingPay.notes,
        },
      });
    } else {
      await prisma.payrollEntry.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          basicSalary: basic,
          loanInstallment: loan,
          taxDeducted: tax,
          otherDeductions: other,
          netPayable: net,
          amountPaid: paid,
          remaining: rem,
          status: nextStatus,
          notes: notes || null,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:update POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const periodId = req.nextUrl.searchParams.get("periodId");
    const employeeNameRaw = req.nextUrl.searchParams.get("employeeName");
    if (!periodId || !employeeNameRaw) {
      return NextResponse.json(
        { error: "periodId and employeeName required" },
        { status: 400 }
      );
    }
    const employeeName = employeeNameRaw.trim();

    // Find the employee case-insensitively so a stray space / case mismatch
    // in the row never blocks deletion.
    const emp = await prisma.employee.findFirst({
      where: { name: { equals: employeeName, mode: "insensitive" } },
    });

    // Delete the payroll row (and any transaction links pointing at it)
    const pay = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName: emp?.name ?? employeeName },
    });
    if (pay) {
      await prisma.transactionLink.deleteMany({
        where: { entityType: "payroll", entityId: pay.id },
      });
    }

    await prisma.commission.deleteMany({
      where: { periodId, employeeName: emp?.name ?? employeeName },
    });
    await prisma.payrollEntry.deleteMany({
      where: { periodId, employeeName: emp?.name ?? employeeName },
    });

    // Optional: also remove this month's sales entries for that employee so
    // the row actually disappears from the aggregated table.
    if (emp) {
      await prisma.salesPerformance.deleteMany({
        where: { periodId, employeeName: emp.name },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:update DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}