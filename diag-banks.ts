import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

(async () => {
  const banks = await p.bankBalance.findMany({
    orderBy: { accountName: "asc" },
  });

  console.log("");
  console.log("=== BankBalance table (feeds Bank & Cash) ===");
  console.log("");
  let total = 0;
  for (const b of banks) {
    console.log(
      b.accountName.padEnd(30) +
        "Rs " +
        b.balance.toLocaleString("en-PK").padStart(15) +
        "   (id: " +
        b.id.slice(0, 8) +
        ")"
    );
    total += b.balance;
  }
  console.log("");
  console.log("---------------------------------------------");
  console.log(
    "TOTAL".padEnd(30) + "Rs " + total.toLocaleString("en-PK").padStart(15)
  );
  console.log("");
  console.log("If TOTAL matches Rs 695,983 - Balance Sheet is correct.");
  console.log("If not - click Sync from books on the Balance Sheet page.");
  console.log("");

  await p.$disconnect();
})();