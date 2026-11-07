import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { clientReceiptGroups } from "../src/lib/client-receipts";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/pacific_storage_verify", "Use the isolated compatibility fixture.");
  await assert.rejects(prisma.clientReceiptReopening.findMany(), (error: unknown) =>
    !!error && typeof error === "object" && "code" in error && error.code === "P2021"
  );
  const period = await prisma.period.create({ data: { year: 2025, month: 1, label: "Storage QA" } });
  const client = await prisma.client.create({ data: { name: "Storage compatibility client" } });
  const invoice = await prisma.receivable.create({ data: {
    periodId: period.id, clientId: client.id, clientName: client.name,
    totalPackage: 100, amountToReceive: 100, amountReceived: 100, remainingAmount: 0,
  } });
  const results = await Promise.all([clientReceiptGroups(period.id), clientReceiptGroups(period.id)]);
  assert.ok(results.every((groups) => groups.get(client.name)?.completed));
  const group = results[0].get(client.name)!;
  await prisma.clientReceiptReopening.create({ data: {
    periodId: period.id, clientName: client.name, balanceSignature: group.signature,
  } });
  assert.equal((await clientReceiptGroups(period.id)).get(client.name)?.reopened, true);
  const after = await prisma.receivable.findUniqueOrThrow({ where: { id: invoice.id } });
  assert.equal(after.amountReceived, 100);
  assert.equal(after.remainingAmount, 0);
  console.log("Storage compatibility QA passed: missing-table failure reproduced, concurrent initialization recovered, restore persisted and balances preserved.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
