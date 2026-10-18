// src/app/api/sales-team/entry/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { computeSalesPayroll, isTeamLeadName } from "@/lib/payroll-service";
import { setSaleForClient, clearSaleForClient } from "@/lib/sales-sync";

/** Adjust bank by delta (positive = money in). */
async function adjustBank(accountName: string | null | undefined, delta: number) {
  if (!accountName || delta === 0) return;
  const trimmed = String(accountName).trim();
  if (!trimmed) return;
  const normalized = trimmed.toLowerCase();
  const all = await prisma.bankBalance.findMany();
  const existing = all.find(
    (b) => b.accountName.trim().toLowerCase() === normalized
  );
  if (existing) {
    await prisma.bankBalance.update({
      where: { id: existing.id },
      data: { balance: existing.balance + delta },
    });
  } else {
    await prisma.bankBalance.create({
      data: { accountName: trimmed, balance: Math.max(0, delta) },
    });
  }
}

/** Upsert Client master + Receivable for a sales entry. Returns the receivable. */
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
  bankAccount?: string | null;
}) {
  const name = (opts.clientName || "").trim();
  if (!name) return null;

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

  if (pkg <= 0 && paid <= 0) return null;

  const total = pkg > 0 ? pkg : paid;
  const remaining = Math.max(0, total - paid);

  const existingRecv = await prisma.receivable.findFirst({
    where: { periodId: opts.periodId, clientName: name },
    orderBy: { createdAt: "asc" },
  });

  if (existingRecv) {
    const prevPaid = existingRecv.amountReceived || 0;
    const prevBank = existingRecv.bankAccount || null;
    const nextBank = (opts.bankAccount || "").trim() || prevBank;

    // On edit: use `total` as the authoritative package (not stacked)
    const newTotal = total;
    const newReceived = Math.min(newTotal, paid > 0 ? paid : prevPaid);
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
        bankAccount: nextBank,
      },
    });

    // Bank: apply the delta on the (possibly new) account
    if (nextBank && prevBank && nextBank.toLowerCase() !== prevBank.toLowerCase()) {
      if (prevPaid > 0) await adjustBank(prevBank, -prevPaid);
      if (newReceived > 0) await adjustBank(nextBank, newReceived);
    } else {
      const paidDelta = newReceived - prevPaid;
      if (paidDelta !== 0) {
        await adjustBank(nextBank ?? prevBank, paidDelta);
      }
    }

    return { client, receivableId: existingRecv.id, total: newTotal, paid: newReceived };
  }

  const created = await prisma.receivable.create({
    data: {
      periodId: opts.periodId,
      clientId: client.id,
      clientName: client.name,
      bookingDate: opts.tourDate ? new Date(opts.tourDate) : null,
      tripDates: opts.description || null,
      salesperson: opts.salesperson || null,
      bankAccount: (opts.bankAccount || "").trim() || null,
      totalPackage: total,
      amountToReceive: total,
      amountReceived: paid,
      remainingAmount: remaining,
      status: remaining <= 0 ? "Settled" : paid > 0 ? "Partial" : "Open",
      notes: "Auto-created from sales-team entry",
    },
  });

  if (paid > 0) {
    await adjustBank(opts.bankAccount, paid);
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

  return { client, receivableId: created.id, total, paid };
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
      bankAccount,
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

    const amt = Number(amount) || 0;

    if (clientName) {
      // Upsert receivable + client master FIRST (so bank + receivable are right)
      const upserted = await upsertClientFromSale({
        periodId,
        clientName,
        clientPhone: clientPhone || null,
        clientContact: clientContact || null,
        clientEmail: clientEmail || null,
        clientNotes: clientNotes || null,
        totalPackage: Number(clientTotalPackage) || amt,
        amountPaid: Number(clientAmountPaid) || 0,
        tourDate,
        description,
        salesperson: employeeName,
        bankAccount: bankAccount || null,
      });

      // One canonical SalesPerformance row per (client, salesperson)
      await setSaleForClient({
        periodId,
        salesperson: employeeName,
        clientName,
        amount: Number(clientTotalPackage) || amt,
        tourDate,
        description,
        notes,
      });

      // Keep the receivable's salesperson field aligned
      if (upserted?.receivableId) {
        await prisma.receivable.update({
          where: { id: upserted.receivableId },
          data: { salesperson: employeeName },
        });
      }
    } else {
      // No client name — still create a standalone sale row (no receivable link)
      await prisma.salesPerformance.create({
        data: {
          periodId,
          employeeName,
          tourDate: tourDate ? new Date(tourDate) : null,
          description: description || null,
          clientName: null,
          category: "Sale",
          debit: amt,
          credit: 0,
          status: "Completed",
          notes: notes || null,
        },
      });
      await computeSalesPayroll(periodId);
    }

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
      bankAccount,
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

    const newEmployee = employeeName ?? existing.employeeName;
    const newClient = clientName ?? existing.clientName ?? "";
    const newAmount =
      amount != null ? Number(amount) || 0 : existing.debit || 0;

    // If the salesperson OR client name changed, clear old rows and set new
    const employeeChanged =
      existing.employeeName.toLowerCase() !== newEmployee.toLowerCase();
    const clientChanged =
      (existing.clientName || "").toLowerCase() !== newClient.toLowerCase();

    if (employeeChanged || clientChanged) {
      // Remove the old attribution
      if (existing.clientName) {
        await clearSaleForClient({
          periodId: existing.periodId,
          salesperson: existing.employeeName,
          clientName: existing.clientName,
        });
      } else {
        // No client name — just delete the raw row
        await prisma.salesPerformance.delete({ where: { id } });
      }
    }

    if (newClient) {
      // Upsert receivable + bank for the new owner
      await upsertClientFromSale({
        periodId: existing.periodId,
        clientName: newClient,
        clientPhone: clientPhone || null,
        clientContact: clientContact || null,
        clientEmail: clientEmail || null,
        clientNotes: clientNotes || null,
        totalPackage: Number(clientTotalPackage) || newAmount,
        amountPaid: Number(clientAmountPaid) || 0,
        tourDate: tourDate || (existing.tourDate ? existing.tourDate.toISOString() : null),
        description: description ?? existing.description,
        salesperson: newEmployee,
        bankAccount: bankAccount || null,
      });

      // One canonical row for the new owner
      await setSaleForClient({
        periodId: existing.periodId,
        salesperson: newEmployee,
        clientName: newClient,
        amount: Number(clientTotalPackage) || newAmount,
        tourDate: tourDate || (existing.tourDate ? existing.tourDate.toISOString() : null),
        description: description ?? existing.description,
        notes: notes ?? existing.notes,
      });
    } else {
      // Standalone sale (no client) — update in place
      await prisma.salesPerformance.update({
        where: { id },
        data: {
          employeeName: newEmployee,
          tourDate: tourDate ? new Date(tourDate) : existing.tourDate,
          description: description ?? existing.description,
          debit: newAmount,
          notes: notes ?? existing.notes,
        },
      });
      await computeSalesPayroll(existing.periodId);
    }

    return NextResponse.json({ ok: true });
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

    if (row.clientName) {
      await clearSaleForClient({
        periodId: row.periodId,
        salesperson: row.employeeName,
        clientName: row.clientName,
      });
    } else {
      await prisma.salesPerformance.delete({ where: { id } });
      await computeSalesPayroll(row.periodId);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[sales-team:entry:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}