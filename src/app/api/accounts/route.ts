import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * GET /api/accounts
 * Returns the list of bank/cash account names from the Bank page.
 * Used by TransactionForm and any other form that needs the same list.
 */
export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.bankBalance.findMany({
    orderBy: { accountName: "asc" },
    select: { id: true, accountName: true, balance: true },
  });

  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      name: r.accountName,
      balance: r.balance,
    }))
  );
}