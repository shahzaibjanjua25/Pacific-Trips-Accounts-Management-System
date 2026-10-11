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
 * Every Refund is mirrored by a Transaction row in the same period, so the
 * Transactions page, the bank balance, and the Refunds page stay in sync.
 * The Transaction's `txnId` field links back to the Refund (or vice versa)
 * through a stable marker in the description.
 */

const REFUND_TXN_MARKER = "Refund to client";

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

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {
      periodId: body.periodId,
      clientName: body.clientName,
      amount: Number(body.amount) || 0,
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

    // ── Mirror into the Transactions table ──
    // Only create the transaction when the refund is Paid (money actually left).
    if (row.status === "Paid" && row.amount > 0) {
      const account = body.bankAccount || "Cash";
      const txn = await prisma.transaction.create({
        data: {
          periodId: row.periodId,
          date: row.paidDate ?? new Date(),
          description:
            `${REFUND_TXN_MARKER} — ${row.clientName}` +
            (row.reason ? ` (${row.reason})` : ""),
          category: "Refund to Client",
          subCategory: row.reason || null,
          party: row.clientName,
          tripRef: row.tripRef || null,
          debit: 0,
          credit: row.amount,
          paymentMethod: account,
          bankAccount: account,
          status: "Completed",
          enteredBy: body.enteredBy || null,
          notes: row.notes || "Auto-posted from Refunds page",
          txnId: row.id, // link back to the refund
        },
      });
      // Adjust bank balance (money out)
      await adjustBank(account, -row.amount);

      // Link the transaction to the refund so history is traceable
      await prisma.transactionLink.create({
        data: {
          transactionId: txn.id,
          periodId: row.periodId,
          entityType: "refund",
          entityId: row.id,
          appliedAmount: row.amount,
        },
      });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error("[refunds:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

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

    // ── Sync the mirror transaction ──
    const linkedTxn = await prisma.transaction.findFirst({
      where: { txnId: row.id, category: "Refund to Client" },
    });

    if (linkedTxn) {
      // Reverse the old bank effect
      await adjustBank(linkedTxn.bankAccount, linkedTxn.credit);

      if (row.status === "Paid" && row.amount > 0) {
        // Update the transaction in place
        await prisma.transaction.update({
          where: { id: linkedTxn.id },
          data: {
            date: row.paidDate ?? linkedTxn.date,
            description:
              `${REFUND_TXN_MARKER} — ${row.clientName}` +
              (row.reason ? ` (${row.reason})` : ""),
            subCategory: row.reason || null,
            party: row.clientName,
            tripRef: row.tripRef || null,
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
    } else if (row.status === "Paid" && row.amount > 0) {
      // No mirror existed (refund was Pending, now Paid) → create it
      const account = body.bankAccount || "Cash";
      const txn = await prisma.transaction.create({
        data: {
          periodId: row.periodId,
          date: row.paidDate ?? new Date(),
          description:
            `${REFUND_TXN_MARKER} — ${row.clientName}` +
            (row.reason ? ` (${row.reason})` : ""),
          category: "Refund to Client",
          subCategory: row.reason || null,
          party: row.clientName,
          tripRef: row.tripRef || null,
          debit: 0,
          credit: row.amount,
          paymentMethod: account,
          bankAccount: account,
          status: "Completed",
          enteredBy: body.enteredBy || null,
          notes: row.notes || "Auto-posted from Refunds page",
          txnId: row.id,
        },
      });
      await adjustBank(account, -row.amount);
      await prisma.transactionLink.create({
        data: {
          transactionId: txn.id,
          periodId: row.periodId,
          entityType: "refund",
          entityId: row.id,
          appliedAmount: row.amount,
        },
      });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error("[refunds:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const refund = await prisma.refund.findUnique({ where: { id } });
    if (!refund) return NextResponse.json({ ok: true, alreadyGone: true });

    // ── Revert the mirror transaction ──
    const linkedTxn = await prisma.transaction.findFirst({
      where: { txnId: id, category: "Refund to Client" },
    });
    if (linkedTxn) {
      // Reverse the bank effect (add back the credit)
      await adjustBank(linkedTxn.bankAccount, linkedTxn.credit);

      await prisma.transactionLink.deleteMany({
        where: { transactionId: linkedTxn.id },
      });
      await prisma.transaction.delete({ where: { id: linkedTxn.id } });
    }

    // Remove the ClientLedger row and the Refund itself
    await removeRefundFromClientLedger(id);
    await prisma.refund.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[refunds:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}