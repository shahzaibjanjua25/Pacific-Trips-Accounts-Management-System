import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { syncPayrollForEmployee } from "@/lib/links-service";

const RATE = 0.025; // 2.5%

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
  // src/app/api/sales-team/entry/route.ts
  // ADD this PUT handler (keep existing POST and DELETE)

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

  // ---- THE KEY FIX: sync the payroll row ----
  if (emp.role === "Sales") {
    await syncPayrollForEmployee(periodId, employeeName);
  }
}
export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, employeeName, tourDate, description, clientName, amount, notes } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const existing = await prisma.salesPerformance.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const updated = await prisma.salesPerformance.update({
      where: { id },
      data: {
        employeeName: employeeName ?? existing.employeeName,
        tourDate: tourDate ? new Date(tourDate) : existing.tourDate,
        description: description ?? existing.description,
        clientName: clientName ?? existing.clientName,
        debit: amount != null ? Number(amount) || 0 : existing.debit,
        notes: notes ?? existing.notes,
      },
    });

    // Recompute both old and new employee (in case employee changed)
    await recompute(existing.periodId, existing.employeeName);
    if (employeeName && employeeName !== existing.employeeName) {
      await recompute(existing.periodId, employeeName);
    }

    return NextResponse.json({ ok: true, row: updated });
  } catch (e) {
    console.error("[sales-team:entry:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
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