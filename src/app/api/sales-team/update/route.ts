import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

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

    const emp = await prisma.employee.findFirst({
      where: { name: employeeName, isActive: true },
    });
    if (!emp) {
      return NextResponse.json({ error: "Employee not found" }, { status: 404 });
    }

    // Preserve the role exactly — never coerce "Team Lead-Sales" to "Sales".
    const nextRole = role ?? emp.role ?? "Sales";

    if (basicSalary != null || role != null) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          ...(basicSalary != null ? { basicSalary: Number(basicSalary) || 0 } : {}),
          ...(role != null ? { role: nextRole } : {}),
        },
      });
    }

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
      where: { periodId, employeeName },
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
          employeeName,
          saleAmount: saleAmt,
          commissionRate: rate,
          commissionAmt: commAmt,
          status: status === "Paid" ? "Paid" : "Accrued",
          notes: notes || null,
        },
      });
    }

    const existingPay = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName },
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

    const paid = amountPaid != null ? Number(amountPaid) || 0 : existingPay?.amountPaid ?? 0;
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
          employeeName,
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
    const employeeName = req.nextUrl.searchParams.get("employeeName");
    if (!periodId || !employeeName) {
      return NextResponse.json(
        { error: "periodId and employeeName required" },
        { status: 400 }
      );
    }

    const pay = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName },
    });
    if (pay) {
      await prisma.transactionLink.deleteMany({
        where: { entityType: "payroll", entityId: pay.id },
      });
    }

    await prisma.commission.deleteMany({ where: { periodId, employeeName } });
    await prisma.payrollEntry.deleteMany({ where: { periodId, employeeName } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:update DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}