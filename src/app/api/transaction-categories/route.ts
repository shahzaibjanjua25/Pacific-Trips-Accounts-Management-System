import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { TRANSACTION_CATEGORIES } from "@/lib/transaction-categories";
import { ensureTransactionCategoryStorage } from "@/lib/transaction-category-storage";

export async function GET() {
  if (!await getSessionUserId()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  await ensureTransactionCategoryStorage();
  const saved = await prisma.$queryRaw<{ name: string }[]>`SELECT "name" FROM "TransactionCategory" ORDER BY "name"`;
  const used = await prisma.transaction.findMany({ distinct: ["category"], select: { category: true } });
  return NextResponse.json([...new Set([...TRANSACTION_CATEGORIES, ...saved.map((row) => row.name), ...used.map((row) => row.category)])]);
}

export async function POST(req: NextRequest) {
  if (!await getSessionUserId()) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) {
    return NextResponse.json({ error: "Enter a category name between 1 and 80 characters." }, { status: 400 });
  }
  await ensureTransactionCategoryStorage();
  const existing = [...TRANSACTION_CATEGORIES,
    ...(await prisma.$queryRaw<{ name: string }[]>`SELECT "name" FROM "TransactionCategory"`).map((row) => row.name)];
  const canonical = existing.find((item) => item.toLowerCase() === name.toLowerCase());
  if (canonical) return NextResponse.json({ name: canonical });
  // Serialize creation so differently cased names cannot race into duplicate options.
  const category = await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(83909550, 20261115)`;
    const [duplicate] = await db.$queryRaw<{ name: string }[]>`
      SELECT "name" FROM "TransactionCategory" WHERE lower("name") = lower(${name})
    `;
    if (duplicate) return duplicate.name;
    await db.$executeRaw`INSERT INTO "TransactionCategory" ("name") VALUES (${name})`;
    return name;
  });
  return NextResponse.json({ name: category });
}
