
import { PrismaClient } from "@prisma/client";
import { syncRefundToClientLedger } from "../src/lib/links-service";

const prisma = new PrismaClient();

async function main() {
  const refunds = await prisma.refund.findMany();
  console.log(`Backfilling ${refunds.length} refunds…`);
  for (const r of refunds) {
    await syncRefundToClientLedger(r.id);
  }
  console.log("Done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());