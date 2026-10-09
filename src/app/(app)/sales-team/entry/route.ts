import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

const RATE = 0.025; // 2.5%

/** Recompute commission + payroll for one employee based on all their
 *  SalesPerformance entries in this period. */
async function recompute(periodId: string, employeeName: string) {
  const emp = await prisma.employee.findFirst({ where: { name: employeeName } });
  if (!emp) return;

  const isLead =
    employeeName.toLowerCase().includes("amad") ||
    employeeName.toLowerCase().includes("ammar");

  // Sum this person's sales entries
  const entries = await prisma.salesPerformance.findMany({
    where: { periodId, employeeName },
  });
  const individualTotal = entries.reduce((s, e) => s + (e.debit || 0), 0);

  // Team total (excluding leads) for team-lead commission
  let teamTotal = 0;
  if (isLead) {
    const teamMembers = await prisma.employee.findMany({
      where: { isActive: true, role: "Sales" },
    });
    for (const m of teamMembers) {
      const nm = m.name.toLowerCase();
      if (nm.includes("amad") || nm.includes("ammar")) continue;
      const rows = await prisma.salesPerformance.findMany({
        where: { periodId, employeeName: m.name },
      });
      teamTotal += rows.reduce((s, r) => s + (r.debit || 0), 0);
    }
  }

  const saleBase = isLead ? teamTotal : individualTotal;
  const commission = saleBase * RATE;

  // Upsert commission record
  const existingComm = await prisma.commission.findFirst({
    where: { periodId, employeeName },
  });
  if (existingComm) {
    await prisma.commission.update({
      where: { id: existingComm.id },
      data: {
        saleAmount: saleBase,
        commissionRate: RATE * 100,
        commissionAmt: commission,
      },
    });
  } else {
    await prisma.commission.create({
      data: {
        periodId,
        employeeId: emp.id,
        employeeName,
        saleAmount: saleBase,
        commissionRate: RATE * 100,
        commissionAmt: commission,
        status: "Accrued",
      },
    });
  }

  // Upsert payroll row (Sales team only)
  if (emp.role === "Sales") {
    const existingPay = await prisma.payrollEntry.findFirst({
      where: { periodId, employeeName },
    });
    const basic = isLead ? 0 : emp.basicSalary || 40000;
    const tax = existingPay?.taxDeducted ?? 0;
    const loan = existingPay?.loanInstallment ?? 0;
    const other = existingPay?.otherDeductions ?? 0;
    const paid = existingPay?.amountPaid ?? 0;
    const netPayable = Math.max(0, basic + commission - tax - loan - other);
    const remaining = Math.max(0, netPayable - paid);
    const status = remaining <= 0 && paid > 0 ? "Paid" : paid > 0 ? "Partial" : "Pending";

    if (existingPay) {
      await prisma.payrollEntry.update({
        where: { id: existingPay.id },
        data: { basicSalary: basic, netPayable, remaining, status },
      });
    } else {
      await prisma.payrollEntry.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName,
          basicSalary: basic,
          netPayable,
          remaining,
          status,
          notes: isLead
            ? "Team Lead — 2.5% of team sales"
            : "Sales — 40k + 2.5% of own sales",
        },
      });
    }
  }
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { periodId, employeeName, tourDate, description, clientName, amount, notes } = body;
    if (!periodId || !employeeName || !amount) {
      return NextResponse.json({ error: "periodId, employeeName, amount required" }, { status: 400 });
    }

    await prisma.salesPerformance.create({
      data: {
        periodId,
        employeeName,
        tourDate: tourDate ? new Date(tourDate) : null,
        description: description || null,
        clientName: clientName || null,
        category: "Sale",
        debit: Number(amount) || 0,
        credit: 0,
        status: "Completed",
        notes: notes || null,
      },
    });

    await recompute(periodId, employeeName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:entry:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const row = await prisma.salesPerformance.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.salesPerformance.delete({ where: { id } });
    await recompute(row.periodId, row.employeeName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:entry:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}