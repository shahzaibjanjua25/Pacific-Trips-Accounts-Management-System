import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

function canonicalizeRole(raw: unknown): string {
  if (raw == null) return "Sales";
  const t = String(raw).trim();
  if (!t) return "Sales";
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
  // Keep other roles as-is, but Sales Team page only shows Sales roles
  return t;
}

/** Case-insensitive employee lookup; create Sales employee if missing. */
async function findOrCreateEmployee(employeeName: string, role?: string | null) {
  const name = employeeName.trim();
  if (!name) return null;

  let emp = await prisma.employee.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });

  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        name,
        role: canonicalizeRole(role ?? "Sales"),
        basicSalary: 40000,
        isActive: true,
      },
    });
  }

  return emp;
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

    const emp = await findOrCreateEmployee(String(employeeName), role);
    if (!emp) {
      return NextResponse.json(
        { error: "Employee name required" },
        { status: 400 }
      );
    }

    const nextRole = canonicalizeRole(role ?? emp.role ?? "Sales");

    await prisma.employee.update({
      where: { id: emp.id },
      data: {
        role: nextRole,
        isActive: true,
        ...(basicSalary != null
          ? { basicSalary: Number(basicSalary) || 0 }
          : {}),
      },
    });

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

    // Match commission by period + name (case-insensitive via employeeName stored)
    const existingComm =
      (await prisma.commission.findFirst({
        where: { periodId, employeeName: emp.name },
      })) ??
      (await prisma.commission.findFirst({
        where: {
          periodId,
          employeeName: { equals: emp.name, mode: "insensitive" },
        },
      }));

    if (existingComm) {
      await prisma.commission.update({
        where: { id: existingComm.id },
        data: {
          employeeId: emp.id,
          employeeName: emp.name,
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

    const existingPay =
      (await prisma.payrollEntry.findFirst({
        where: { periodId, employeeName: emp.name },
      })) ??
      (await prisma.payrollEntry.findFirst({
        where: {
          periodId,
          employeeName: { equals: emp.name, mode: "insensitive" },
        },
      }));

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
      amountPaid != null
        ? Number(amountPaid) || 0
        : existingPay?.amountPaid ?? 0;
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
          employeeId: emp.id,
          employeeName: emp.name,
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

    return NextResponse.json({ ok: true, employeeId: emp.id, role: nextRole });
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
    const employeeName = req.nextUrl.searchParams.get("employeeName");
    // Optional: demoteFromSales=1 also sets Employee.role to Staff so they
    // leave the Sales Team page (rows are built from Employee, not payroll).
    const demote =
      req.nextUrl.searchParams.get("demoteFromSales") !== "0";

    if (!periodId || !employeeName) {
      return NextResponse.json(
        { error: "periodId and employeeName required" },
        { status: 400 }
      );
    }

    const name = employeeName.trim();

    // Find all payroll rows for this person this period (any casing)
    const pays = await prisma.payrollEntry.findMany({
      where: {
        periodId,
        employeeName: { equals: name, mode: "insensitive" },
      },
    });
    if (pays.length > 0) {
      await prisma.transactionLink.deleteMany({
        where: {
          entityType: "payroll",
          entityId: { in: pays.map((p) => p.id) },
        },
      });
    }

    await prisma.commission.deleteMany({
      where: {
        periodId,
        employeeName: { equals: name, mode: "insensitive" },
      },
    });
    await prisma.payrollEntry.deleteMany({
      where: {
        periodId,
        employeeName: { equals: name, mode: "insensitive" },
      },
    });

    // Remove from Sales Team roster for this app view by demoting role.
    // (Page lists employees where role is Sales / Team Lead-Sales.)
    if (demote) {
      await prisma.employee.updateMany({
        where: {
          name: { equals: name, mode: "insensitive" },
          role: { in: ["Sales", "Team Lead-Sales"] },
        },
        data: { role: "Staff" },
      });
    }

    return NextResponse.json({ ok: true, demoted: demote });
  } catch (e) {
    console.error("[sales-team:update DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
