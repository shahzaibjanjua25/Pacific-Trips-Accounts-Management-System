// src/app/api/sales-team/update/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * Full-row override for one employee's sales-team row in a period.
 *
 * Accepts:
 *   periodId, employeeName,
 *   role                 "Sales" | "Team Lead-Sales"
 *   basicSalary          number
 *   individualSales      number
 *   saleBase             number
 *   commissionRate       number (percentage)
 *   commissionAmt        number
 *   netPayable           number   (optional — auto if blank/NaN)
 *   amountPaid           number
 *   status               "Pending" | "Partial" | "Paid"
 *   notes                string
 */
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

    // ── Role is editable but restricted ──
    const nextRole =
      role === "Team Lead-Sales" ? "Sales" : role || emp.role || "Sales";

    // Update employee basic salary too (so future months carry it)
    if (basicSalary != null) {
      await prisma.employee.update({
        where: { id: emp.id },
        data: {
          basicSalary: Number(basicSalary) || 0,
          role: nextRole,
        },
      });
    }

    const isLead =
      role === "Team Lead-Sales" ||
      employeeName.toLowerCase().includes("amad") ||
      employeeName.toLowerCase().includes("ammar") ||
      employeeName.toLowerCase().includes("ahmad");

    // ── Commission ──
    const saleAmt = Number(saleBase) || Number(individualSales) || 0;
    const rate = commissionRate != null ? Number(commissionRate) : 2.5;
    const commAmt =
      commissionAmt != null
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
        },
      });
    }

    // ── Payroll ──
    const existingPay = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName },
    });

    const basic =
      basicSalary != null
        ? Number(basicSalary) || 0
        : isLead
          ? 0
          : emp.basicSalary || 40000;

    const loan = existingPay?.loanInstallment ?? 0;
    const tax = existingPay?.taxDeducted ?? 0;
    const other = existingPay?.otherDeductions ?? 0;

    const computedNet = Math.max(0, basic + commAmt - tax - loan - other);
    const net =
      netPayable != null && !Number.isNaN(Number(netPayable))
        ? Number(netPayable)
        : computedNet;

    const paid = Number(amountPaid) || 0;
    const remaining = Math.max(0, net - paid);

    let nextStatus: string;
    if (status) {
      nextStatus = status;
    } else if (remaining <= 0 && paid > 0) {
      nextStatus = "Paid";
    } else if (paid > 0) {
      nextStatus = "Partial";
    } else {
      nextStatus = "Pending";
    }

    if (existingPay) {
      await prisma.payrollEntry.update({
        where: { id: existingPay.id },
        data: {
          basicSalary: basic,
          netPayable: net,
          amountPaid: paid,
          remaining,
          status: nextStatus,
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
          loanInstallment: loan,
          taxDeducted: tax,
          otherDeductions: other,
          netPayable: net,
          amountPaid: paid,
          remaining,
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
}//