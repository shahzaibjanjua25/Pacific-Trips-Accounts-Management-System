/**
 * verify-employee-role.ts
 *
 * Proves Employee.role is stored correctly without using the UI.
 *
 * Usage (from project root, with DATABASE_URL set):
 *   npx tsx scripts/verify-employee-role.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

async function main() {
  const name = "RoleProbe_" + Date.now();

  const created = await p.employee.create({
    data: { name, role: "Sales", basicSalary: 40000, isActive: true },
  });
  console.log("CREATE role =", JSON.stringify(created.role));

  const again = await p.employee.findUnique({ where: { id: created.id } });
  console.log("READ   role =", JSON.stringify(again?.role));

  const updated = await p.employee.update({
    where: { id: created.id },
    data: { role: "Team Lead-Sales" },
  });
  console.log("UPDATE role =", JSON.stringify(updated.role));

  // List current employees and their buckets
  console.log("\n--- All employees (SALES / OTHER) ---");
  const rows = await p.employee.findMany({ orderBy: { name: "asc" } });
  for (const e of rows) {
    const r = (e.role || "").trim().toLowerCase();
    const sales =
      r === "sales" ||
      r === "sale" ||
      r === "team lead-sales" ||
      r === "team lead sales" ||
      r === "teamlead-sales" ||
      r === "team-lead-sales";
    console.log(
      (sales ? "SALES " : "OTHER ") +
        e.name.padEnd(28) +
        " role=" +
        JSON.stringify(e.role)
    );
  }

  await p.employee.delete({ where: { id: created.id } });
  console.log("\nProbe row deleted.");

  if (created.role !== "Sales" || updated.role !== "Team Lead-Sales") {
    console.error("FAILED: role not stored as expected");
    process.exitCode = 1;
  } else {
    console.log("OK: role create/update works at the DB layer.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
