import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { syncPayrollForEmployee } from "@/lib/links-service";

const RATE = 0.025;

async function recompute(periodId: string, employeeName: string) {
  const emp = await prisma.employee.findFirst({ where: { name: employeeName } });
  if (!emp) return;

  if (emp.role !== "Sales") {
    await syncPayrollForEmployee(periodId, employeeName);
    return;
  }

  const isLead =
    employeeName.toLowerCase().includes("amad") ||
    employeeName.toLowerCase().includes("ammar");

  const entries = await prisma.salesPerformance.findMany({
    where: { periodId, employeeName },
  });
  const individualTotal = entries.reduce((s, e) => s + (e.debit || 0), 0);

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

  await syncPayrollForEmployee(periodId, employeeName);
}

/**
 * Upsert a Client master row + Receivable + ClientLedger for a sales entry.
 * Called from POST and PUT so new clients always appear on the Clients page.
 */
async function upsertClientFromSale(opts: {
  periodId: string;
  clientName: string;
  clientPhone?: string | null;
  clientContact?: string | null;
  clientEmail?: string | null;
  clientNotes?: string | null;
  totalPackage?: number;
  amountPaid?: number;
  tourDate?: string | null;
  description?: string | null;
  salesperson?: string | null;
}) {
  const name = (opts.clientName || "").trim();
  if (!name) return;

  let client = await prisma.client.findFirst({ where: { name } });
  if (!client) {
    client = await prisma.client.create({
      data: {
        name,
        phone: opts.clientPhone || null,
        contact: opts.clientContact || null,
        email: opts.clientEmail || null,
        notes: opts.clientNotes || null,
      },
    });
  } else {
    // Enrich blanks
    const updates: Record<string, string> = {};
    if (!client.phone && opts.clientPhone) updates.phone = opts.clientPhone;
    if (!client.contact && opts.clientContact) updates.contact = opts.clientContact;
    if (!client.email && opts.clientEmail) updates.email = opts.clientEmail;
    if (!client.notes && opts.clientNotes) updates.notes = opts.clientNotes;
    if (Object.keys(updates).length > 0) {
      client = await prisma.client.update({
        where: { id: client.id },
        data: updates,
      });
    }
  }

  // Create/update a Receivable for the sale
  const pkg = Number(opts.totalPackage) || 0;
  const paid = Number(opts.amountPaid) || 0;
  if (pkg > 0 || paid > 0) {
    const total = pkg > 0 ? pkg : paid;
    const remaining = Math.max(0, total - paid);
    const existingRecv = await prisma.receivable.findFirst({
      where: { periodId: opts.periodId, clientName: name },
      orderBy: { createdAt: "asc" },
    });
    if (existingRecv) {
      const newTotal = Math.max(existingRecv.totalPackage, total);
      const newReceived = Math.min(newTotal, existingRecv.amountReceived + paid);
      const newRemaining = Math.max(0, newTotal - newReceived);
      await prisma.receivable.update({
        where: { id: existingRecv.id },
        data: {
          totalPackage: newTotal,
          amountToReceive: newTotal,
          amountReceived: newReceived,
          remainingAmount: newRemaining,
          status:
            newRemaining <= 0 && newReceived > 0
              ? "Settled"
              : newReceived > 0
                ? "Partial"
                : "Open",
        },
      });
    } else {
      await prisma.receivable.create({
        data: {
          periodId: opts.periodId,
          clientId: client.id,
          clientName: client.name,
          bookingDate: opts.tourDate ? new Date(opts.tourDate) : null,
          tripDates: opts.description || null,
          salesperson: opts.salesperson || null,
          totalPackage: total,
          amountToReceive: total,
          amountReceived: paid,
          remainingAmount: remaining,
          status: remaining <= 0 ? "Settled" : paid > 0 ? "Partial" : "Open",
          notes: "Auto-created from sales-team entry",
        },
      });
    }

    if (paid > 0) {
      await prisma.clientLedger.create({
        data: {
          clientId: client.id,
          clientName: client.name,
          tourDate: opts.tourDate ? new Date(opts.tourDate) : new Date(),
          description: opts.description || "Sale entry",
          category: "Revenue",
          hotel: "Payment",
          debit: paid,
          credit: 0,
          status: "Received",
          notes: "Auto-posted from sales-team entry",
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
    const {
      periodId,
      employeeName,
      tourDate,
      description,
      clientName,
      amount,
      notes,
      clientPhone,
      clientContact,
      clientEmail,
      clientNotes,
      clientTotalPackage,
      clientAmountPaid,
    } = body;
    if (!periodId || !employeeName || !amount) {
      return NextResponse.json(
        { error: "periodId, employeeName, amount required" },
        { status: 400 }
      );
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

    // ── Create/update client + receivable ──
    if (clientName) {
      await upsertClientFromSale({
        periodId,
        clientName,
        clientPhone: clientPhone || null,
        clientContact: clientContact || null,
        clientEmail: clientEmail || null,
        clientNotes: clientNotes || null,
        totalPackage: Number(clientTotalPackage) || Number(amount) || 0,
        amountPaid: Number(clientAmountPaid) || 0,
        tourDate,
        description,
        salesperson: employeeName,
      });
    }

    await recompute(periodId, employeeName);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:entry:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      id,
      employeeName,
      tourDate,
      description,
      clientName,
      amount,
      notes,
      clientPhone,
      clientContact,
      clientEmail,
      clientNotes,
      clientTotalPackage,
      clientAmountPaid,
    } = body;
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

    // ── Refresh client + receivable ──
    if (clientName) {
      await upsertClientFromSale({
        periodId: existing.periodId,
        clientName,
        clientPhone: clientPhone || null,
        clientContact: clientContact || null,
        clientEmail: clientEmail || null,
        clientNotes: clientNotes || null,
        totalPackage: Number(clientTotalPackage) || Number(amount) || 0,
        amountPaid: Number(clientAmountPaid) || 0,
        tourDate,
        description,
        salesperson: employeeName ?? existing.employeeName,
      });
    }

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