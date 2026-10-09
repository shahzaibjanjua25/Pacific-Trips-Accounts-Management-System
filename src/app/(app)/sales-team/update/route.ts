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
      individualSales,
      commissionAmt,
      amountPaid,
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

    const isLead =
      employeeName.toLowerCase().includes("amad") ||
      employeeName.toLowerCase().includes("ammar");

    // Upsert commission
    const existingComm = await prisma.commission.findFirst({
      where: { periodId, employeeName },
    });
    if (existingComm) {
      await prisma.commission.update({
        where: { id: existingComm.id },
        data: {
          saleAmount: Number(individualSales) || 0,
          commissionRate: 2.5,
          commissionAmt: Number(commissionAmt) || 0,
        },
      });
    } else {
      await prisma.commission.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName,
          saleAmount: Number(individualSales) || 0,
          commissionRate: 2.5,
          commissionAmt: Number(commissionAmt) || 0,
          status: "Accrued",
        },
      });
    }

    // Upsert payroll
    const existingPay = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName },
    });
    const basic = isLead ? 0 : emp.basicSalary || 40000;
    const comm = Number(commissionAmt) || 0;
    const loan = existingPay?.loanInstallment ?? 0;
    const tax = existingPay?.taxDeducted ?? 0;
    const other = existingPay?.otherDeductions ?? 0;
    const netPayable = Math.max(0, basic + comm - tax - loan - other);
    const paid = Number(amountPaid) || 0;
    const remaining = Math.max(0, netPayable - paid);

    if (existingPay) {
      await prisma.payrollEntry.update({
        where: { id: existingPay.id },
        data: {
          basicSalary: basic,
          netPayable,
          amountPaid: paid,
          remaining,
          status: remaining <= 0 && paid > 0 ? "Paid" : paid > 0 ? "Partial" : "Pending",
          notes: notes || existingPay.notes,
        },
      });
    } else {
      await prisma.payrollEntry.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName,
          basicSalary: basic,
          netPayable,
          amountPaid: paid,
          remaining,
          status: remaining <= 0 && paid > 0 ? "Paid" : paid > 0 ? "Partial" : "Pending",
          notes: notes || null,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:update]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}