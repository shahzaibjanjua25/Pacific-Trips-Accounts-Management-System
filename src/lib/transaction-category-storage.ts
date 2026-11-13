import { prisma } from "./prisma";

let initialization: Promise<void> | undefined;

export function ensureTransactionCategoryStorage() {
  initialization ??= initialize().catch((error) => {
    initialization = undefined;
    throw error;
  });
  return initialization;
}

async function initialize() {
  const [table] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('"TransactionCategory"') IS NOT NULL AS "exists"
  `;
  if (table.exists) return;
  await prisma.$transaction(async (db) => {
    await db.$executeRaw`SELECT pg_advisory_xact_lock(83909550, 20261114)`;
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "TransactionCategory" (
        "name" TEXT NOT NULL PRIMARY KEY,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
  });
}
