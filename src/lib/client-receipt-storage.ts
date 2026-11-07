import { prisma } from "./prisma";

let initialization: Promise<void> | undefined;

/** Initialize storage for deployments that previously used Prisma db push. */
export function ensureClientReceiptStorage(): Promise<void> {
  if (!initialization) {
    initialization = initialize().catch((error) => {
      initialization = undefined;
      throw error;
    });
  }
  return initialization;
}

async function initialize() {
  const [table] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regclass('"ClientReceiptReopening"') IS NOT NULL AS "exists"
  `;
  if (table.exists) return;

  await prisma.$transaction(async (db) => {
    // Serialize initialization across app instances.
    await db.$executeRaw`SELECT pg_advisory_xact_lock(83909550, 20261107)`;
    await db.$executeRaw`
      CREATE TABLE IF NOT EXISTS "ClientReceiptReopening" (
        "id" TEXT NOT NULL,
        "periodId" TEXT NOT NULL,
        "clientName" TEXT NOT NULL,
        "balanceSignature" TEXT NOT NULL,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "ClientReceiptReopening_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ClientReceiptReopening_periodId_fkey"
          FOREIGN KEY ("periodId") REFERENCES "Period"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `;
    await db.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS "ClientReceiptReopening_periodId_clientName_key"
      ON "ClientReceiptReopening"("periodId", "clientName")
    `;
  }, { timeout: 30_000 });
}
