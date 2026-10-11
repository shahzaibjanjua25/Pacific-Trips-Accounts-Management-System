import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import {
  syncRefundToClientLedger,
  removeRefundFromClientLedger,
} from "@/lib/links-service";

/**
 * Refunds API.
 *
 * A refund has multiple side effects:
 *   1. Creates/updates/deletes the Refund row itself.
 *   2. If status = "Paid", REDUCES the client's Receivable.amountReceived
 *      (so the Clients page "Amount Paid" drops by the refund amount).
 *   3. Syncs the ClientLedger row (credit — money out).
 *   4. Mirrors into the Transactions table (Category = "Refund to Client"),
 *      with a matching bank-balance adjustment.
 *
 * All four effects are reverted cleanly on PUT (status → Pending or delete)
 * and on DELETE.
 */

const REFUND_TXN_MARKER = "Refund to client";

/* ────── BANK ────── */
async function adjustBank(
  accountName: string | null | undefined,
  delta: number
) {
  if (!accountName || delta === 0) return;
  const trimmed = accountName.trim();
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

/* ────── RECEIVABLE HELPERS ────── */

/**
 * Reduce the client's Receivable.amountReceived by `delta` (positive).
 * Returns nothing. Safe to call even if no receivable exists.
 */
async function reduceReceivablePaid(opts: {
  periodId: string;
  clientId: string | null;
  clientName: string;
  delta: number;
}) {
  if (opts.delta <= 0) return;

  const recv = await prisma.receivable.findFirst({
    where: {
      periodId: opts.periodId,
      OR: [
        opts.clientId ? { clientId: opts.clientId } : {},
        { clientName: opts.clientName },
      ].filter((o) => Object.keys(o).length > 0),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!recv) return;

  const newReceived = Math.max(0, (recv.amountReceived || 0) - opts.delta);
  const newRemaining = Math.max(0, recv.totalPackage - newReceived);

  await prisma.receivable.update({
    where: { id: recv.id },
    data: {
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
}

/**
 * Add `delta` back to the client's Receivable.amountReceived.
 * Used when a refund is reverted (status → Pending, amount reduced, deleted).
 */
async function restoreReceivablePaid(opts: {
  periodId: string;
  clientId: string | null;
  clientName: string;
  delta: number;
}) {
  if (opts.delta <= 0) return;

  const recv = await prisma.receivable.findFirst({
    where: {
      periodId: opts.periodId,
      OR: [
        opts.clientId ? { clientId: opts.clientId } : {},
        { clientName: opts.clientName },
      ].filter((o) => Object.keys(o).length > 0),
    },
    orderBy: { createdAt: "asc" },
  });
  if (!recv) return;

  const newReceived = Math.min(
    recv.totalPackage,
    (recv.amountReceived || 0) + opts.delta
  );
  const newRemaining = Math.max(0, recv.totalPackage - newReceived);

  await prisma.receivable.update({
    where: { id: recv.id },
    data: {
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
}

/* ────── MIRROR TRANSACTION HELPERS ────── */

async function findMirrorTxn(refundId: string) {
  return prisma.transaction.findFirst({
    where: { txnId: refundId, category: "Refund to Client" },
  });
}

async function createMirrorTxn(opts: {
  refundId: string;
  periodId: string;
  clientName: string;
  amount: number;
  reason: string | null;
  tripRef: string | null;
  notes: string | null;
  date: Date;
  bankAccount: string;
  enteredBy: string | null;
}) {
  const txn = await prisma.transaction.create({
    data: {
      periodId: opts.periodId,
      date: opts.date,
      description:
        `${REFUND_TXN_MARKER} — ${opts.clientName}` +
        (opts.reason ? ` (${opts.reason})` : ""),
      category: "Refund to Client",
      subCategory: opts.reason,
      party: opts.clientName,
      tripRef: opts.tripRef,
      debit: 0,
      credit: opts.amount,
      paymentMethod: opts.bankAccount,
      bankAccount: opts.bankAccount,
      status: "Completed",
      enteredBy: opts.enteredBy,
      notes: opts.notes || "Auto-posted from Refunds page",
      txnId: opts.refundId,
    },
  });
  await prisma.transactionLink.create({
    data: {
      transactionId: txn.id,
      periodId: opts.periodId,
      entityType: "refund",
      entityId: opts.refundId,
      appliedAmount: opts.amount,
    },
  });
  return txn;
}

async function deleteMirrorTxn(refundId: string) {
  const txn = await findMirrorTxn(refundId);
  if (!txn) return;
  await adjustBank(txn.bankAccount, txn.credit); // reverse money out
  await prisma.transactionLink.deleteMany({
    where: { transactionId: txn.id },
  });
  await prisma.transaction.delete({ where: { id: txn.id } });
}

/* ────── GET ────── */
export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const rows = await prisma.refund.findMany({
    where: periodId ? { periodId } : {},
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

/* ────── POST ────── */
export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const amount = Number(body.amount) || 0;

    const data: Record<string, unknown> = {
      periodId: body.periodId,
      clientName: body.clientName,
      amount,
      reason: body.reason || null,
      status: body.status || "Pending",
      tripRef: body.tripRef || null,
      notes: body.notes || null,
    };
    if (body.clientId) data.clientId = body.clientId;
    if (body.paidDate) data.paidDate = new Date(body.paidDate);
    else data.paidDate = null;

    const row = await prisma.refund.create({ data: data as never });
    await syncRefundToClientLedger(row.id);

    // Only when Paid: reduce receivable + mirror into transactions + bank
    if (row.status === "Paid" && row.amount > 0) {
      // 1. Reduce the client's "Amount Paid" by the refund amount
      await reduceReceivablePaid({
        periodId: row.periodId,
        clientId: row.clientId,
        clientName: row.clientName,
        delta: row.amount,
      });

      // 2. Mirror as a transaction
      const account = body.bankAccount || "Cash";
      await createMirrorTxn({
        refundId: row.id,
        periodId: row.periodId,
        clientName: row.clientName,
        amount: row.amount,
        reason: row.reason,
        tripRef: row.tripRef,
        notes: row.notes,
        date: row.paidDate ?? new Date(),
        bankAccount: account,
        enteredBy: body.enteredBy || null,
      });

      // 3. Adjust the bank balance
      await adjustBank(account, -row.amount);
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error("[refunds:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/* ────── PUT ────── */
export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const old = await prisma.refund.findUnique({ where: { id: body.id } });
    if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.clientName !== undefined) data.clientName = body.clientName;
    if (body.amount !== undefined) data.amount = Number(body.amount) || 0;
    if (body.reason !== undefined) data.reason = body.reason || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.tripRef !== undefined) data.tripRef = body.tripRef || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.paidDate !== undefined)
      data.paidDate = body.paidDate ? new Date(body.paidDate) : null;

    const row = await prisma.refund.update({
      where: { id: body.id },
      data: data as never,
    });
    await syncRefundToClientLedger(row.id);

    const wasPaid = old.status === "Paid" && old.amount > 0;
    const nowPaid = row.status === "Paid" && row.amount > 0;

    // ── Reverse the OLD receivable effect if it was Paid ──
    if (wasPaid) {
      await restoreReceivablePaid({
        periodId: old.periodId,
        clientId: old.clientId,
        clientName: old.clientName,
        delta: old.amount,
      });
    }

    // ── Apply the NEW receivable effect if it's still/now Paid ──
    if (nowPaid) {
      await reduceReceivablePaid({
        periodId: row.periodId,
        clientId: row.clientId,
        clientName: row.clientName,
        delta: row.amount,
      });
    }

    // ── Sync the mirror transaction ──
    const linkedTxn = await findMirrorTxn(row.id);
    if (linkedTxn) {
      // Reverse the old bank effect
      await adjustBank(linkedTxn.bankAccount, linkedTxn.credit);

      if (nowPaid) {
        // Update the transaction in place
        await prisma.transaction.update({
          where: { id: linkedTxn.id },
          data: {
            date: row.paidDate ?? linkedTxn.date,
            description:
              `${REFUND_TXN_MARKER} — ${row.clientName}` +
              (row.reason ? ` (${row.reason})` : ""),
            subCategory: row.reason,
            party: row.clientName,
            tripRef: row.tripRef,
            credit: row.amount,
            notes: row.notes || linkedTxn.notes,
          },
        });
        // Re-apply the new bank effect
        await adjustBank(linkedTxn.bankAccount, -row.amount);
      } else {
        // Refund is no longer Paid → delete the mirror transaction
        await prisma.transactionLink.deleteMany({
          where: { transactionId: linkedTxn.id },
        });
        await prisma.transaction.delete({ where: { id: linkedTxn.id } });
      }
    } else if (nowPaid) {
      // Was Pending, now Paid → create the mirror
      const account = body.bankAccount || "Cash";
      await createMirrorTxn({
        refundId: row.id,
        periodId: row.periodId,
        clientName: row.clientName,
        amount: row.amount,
        reason: row.reason,
        tripRef: row.tripRef,
        notes: row.notes,
        date: row.paidDate ?? new Date(),
        bankAccount: account,
        enteredBy: body.enteredBy || null,
      });
      await adjustBank(account, -row.amount);
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error("[refunds:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/* ────── DELETE ────── */
export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const refund = await prisma.refund.findUnique({ where: { id } });
    if (!refund) return NextResponse.json({ ok: true, alreadyGone: true });

    // 1. If it was Paid, add the amount back to the receivable
    if (refund.status === "Paid" && refund.amount > 0) {
      await restoreReceivablePaid({
        periodId: refund.periodId,
        clientId: refund.clientId,
        clientName: refund.clientName,
        delta: refund.amount,
      });
    }

    // 2. Remove the mirror transaction + revert bank effect
    await deleteMirrorTxn(refund.id);

    // 3. Remove the ClientLedger row and the Refund itself
    await removeRefundFromClientLedger(refund.id);
    await prisma.refund.delete({ where: { id } });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[refunds:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}