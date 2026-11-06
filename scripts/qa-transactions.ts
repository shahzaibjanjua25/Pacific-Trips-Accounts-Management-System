import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { DELETE, POST, PUT } from "../src/app/api/transactions/route";
import { prisma } from "../src/lib/prisma";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.pathname, "/pacific_verify", "Use the disposable QA database.");
  const suffix = crypto.randomUUID();
  const client = await prisma.client.create({ data: { name: "QA client " + suffix } });
  const period = await prisma.period.create({
    data: { year: Date.now() % 1_000_000_000, month: 1, label: "QA " + suffix },
  });
  const bankAccount = "QA bank " + suffix;
  const receivable = await prisma.receivable.create({
    data: {
      periodId: period.id, clientId: client.id, clientName: client.name,
      totalPackage: 100, amountToReceive: 100, remainingAmount: 100,
    },
  });
  const input = {
    periodId: period.id, date: "2026-01-01", description: "QA receipt",
    category: "Client Receipt", party: client.name, bankAccount, debit: 80,
  };
  const post = (body: object) => POST(request("POST", body));
  const put = (body: object) => PUT(request("PUT", body));
  const remove = (id: string) => DELETE(new NextRequest("http://localhost/api/transactions?id=" + id, { method: "DELETE" }));
  function request(method: string, body: object) {
    return new NextRequest("http://localhost/api/transactions", {
      method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" },
    });
  }
  async function state(received: number, rows: number) {
    const invoice = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
    assert.equal(invoice.amountReceived, received);
    assert.equal(invoice.remainingAmount, 100 - received);
    assert.equal((await prisma.bankBalance.findFirstOrThrow({ where: { accountName: bankAccount } })).balance, received);
    assert.equal(await prisma.bankTxn.count({ where: { periodId: period.id } }), rows);
    assert.equal(await prisma.clientLedger.count({ where: { clientId: client.id } }), rows);
  }
  const result = await post(input);
  assert.equal(result.status, 200, await result.clone().text());
  const { id, updatedAt } = await result.json();
  await state(80, 1);
  const second = await post({ ...input, description: "Second receipt", debit: 5 });
  assert.equal(second.status, 200, await second.clone().text());
  await state(85, 2);
  const updated = await put({ id, debit: 90, description: "Updated receipt", expectedUpdatedAt: updatedAt });
  assert.equal(updated.status, 200, await updated.clone().text());
  await state(95, 2);
  const stale = await put({ id, debit: 89, expectedUpdatedAt: updatedAt });
  assert.equal(stale.status, 409, await stale.clone().text());
  await state(95, 2);
  const rejected = await put({ id, debit: 96 });
  assert.equal(rejected.status, 400, await rejected.clone().text());
  await state(95, 2);
  assert.equal((await prisma.transaction.findUniqueOrThrow({ where: { id } })).debit, 90);
  assert.equal((await remove(id)).status, 200);
  await state(5, 1);
  assert.equal((await remove(id)).status, 404);

  const draft = await post({ ...input, description: "Draft receipt", status: "Pending" });
  assert.equal(draft.status, 200, await draft.clone().text());
  const draftId = (await draft.json()).id;
  await state(5, 1);
  const completed = await put({ id: draftId, status: "Completed" });
  assert.equal(completed.status, 200, await completed.clone().text());
  await state(85, 2);
  const cancelled = await put({ id: draftId, status: "Cancelled" });
  assert.equal(cancelled.status, 200, await cancelled.clone().text());
  await state(5, 1);

  const excessiveRefund = await post({ ...input, category: "Refund", debit: 0, credit: 6 });
  assert.equal(excessiveRefund.status, 400, await excessiveRefund.clone().text());
  await state(5, 1);
  const refund = await post({ ...input, category: "Refund", debit: 0, credit: 2 });
  assert.equal(refund.status, 200, await refund.clone().text());
  const refundId = (await refund.json()).id;
  await state(3, 2);
  const refundEdit = await put({ id: refundId, credit: 4 });
  assert.equal(refundEdit.status, 200, await refundEdit.clone().text());
  await state(1, 2);
  assert.equal((await remove(refundId)).status, 200);
  await state(5, 1);

  const office = await post({ ...input, category: "Office Expense", debit: 0, credit: 7 });
  assert.equal(office.status, 200, await office.clone().text());
  const officeId = (await office.json()).id;
  const officeEdit = await put({ id: officeId, credit: 9 });
  assert.equal(officeEdit.status, 200, await officeEdit.clone().text());
  const expenses = await prisma.officeExpense.findMany({ where: { periodId: period.id } });
  assert.deepEqual(expenses.map((expense) => expense.amount), [9]);
  assert.equal((await remove(officeId)).status, 200);
  assert.equal(await prisma.officeExpense.count({ where: { periodId: period.id } }), 0);
  await state(5, 1);
  const transfer = await post({ ...input, category: "Bank Transfer", party: bankAccount, debit: 0, credit: 1 });
  assert.equal(transfer.status, 400, await transfer.clone().text());
  await state(5, 1);
  console.log("Transaction QA scenarios passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
