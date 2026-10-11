import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * GET /api/client-paid?periodId=...
 *
 * Returns a map of every client (in that period) with:
 *   - paid:   total amount they've paid us (Receivable.amountReceived)
 *   - refunded: total refunds issued to them in that period (any status)
 *   - refundable: max(0, paid − refunded)
 *
 * Used by the transaction form to compute the refund cap live.
 */
export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) {
    return NextResponse.json({ error: "periodId required" }, { status: 400 });
  }

  const [receivables, refunds] = await Promise.all([
    prisma.receivable.findMany({ where: { periodId } }),
    prisma.refund.findMany({ where: { periodId } }),
  ]);

  const byClient: Record<
    string,
    { paid: number; refunded: number; refundable: number }
  > = {};

  const ensure = (name: string) => {
    if (!byClient[name]) {
      byClient[name] = { paid: 0, refunded: 0, refundable: 0 };
    }
    return byClient[name];
  };

  for (const r of receivables) {
    const key = (r.clientName || "").trim();
    if (!key) continue;
    ensure(key).paid += Math.max(0, r.amountReceived || 0);
  }

  for (const r of refunds) {
    const key = (r.clientName || "").trim();
    if (!key) continue;
    ensure(key).refunded += Math.max(0, r.amount || 0);
  }

  for (const name of Object.keys(byClient)) {
    const e = byClient[name];
    e.refundable = Math.max(0, e.paid - e.refunded);
  }

  return NextResponse.json(byClient);
}