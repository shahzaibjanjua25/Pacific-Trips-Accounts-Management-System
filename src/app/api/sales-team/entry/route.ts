import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { computeSalesPayroll, isTeamLeadName } from "@/lib/payroll-service";

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
      // On edit, set package from the sale amount rather than stacking
      const newTotal = total;
      const newReceived = Math.min(newTotal, paid > 0 ? paid : existingRecv.amountReceived);
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
          salesperson: opts.salesperson || existingRecv.salesperson,
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

async function recomputeAll(periodId: string) {
  // Full team recompute with tiered Team Lead rules
  await computeSalesPayroll(periodId);
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
    if (!periodId || !employeeName || amount == null) {
      return NextResponse.json(
        { error: "periodId, employeeName, amount required" },
        { status: 400 }
      );
    }

    if (isTeamLeadName(employeeName)) {
      return NextResponse.json(
        {
          error:
            "Team Lead cannot be attributed individual sales. Choose a sales team member.",
        },
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

    await recomputeAll(periodId);
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

    if (employeeName && isTeamLeadName(employeeName)) {
      return NextResponse.json(
        {
          error:
            "Team Lead cannot be attributed individual sales. Choose a sales team member.",
        },
        { status: 400 }
      );
    }

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

    if (clientName || existing.clientName) {
      await upsertClientFromSale({
        periodId: existing.periodId,
        clientName: clientName || existing.clientName || "",
        clientPhone: clientPhone || null,
        clientContact: clientContact || null,
        clientEmail: clientEmail || null,
        clientNotes: clientNotes || null,
        totalPackage:
          Number(clientTotalPackage) ||
          (amount != null ? Number(amount) : existing.debit) ||
          0,
        amountPaid: Number(clientAmountPaid) || 0,
        tourDate: tourDate || (existing.tourDate ? existing.tourDate.toISOString() : null),
        description: description ?? existing.description,
        salesperson: employeeName ?? existing.employeeName,
      });
    }

    await recomputeAll(existing.periodId);
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

    // Remove only this sale entry - full debit amount is subtracted because
    // individual sales totals use SalesPerformance exclusively.
    await prisma.salesPerformance.delete({ where: { id } });
    await recomputeAll(row.periodId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:entry:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
