/**
 * fix-employee-roles.ts
 *
 * Optional one-time repair: set known sales people to Sales / Team Lead-Sales
 * if they were previously saved as null or "Staff".
 *
 * Edit FORCE_SALES / FORCE_LEAD to match your team, then:
 *   npx tsx scripts/fix-employee-roles.ts
 */
import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();

/** Names that should be Sales (not Team Lead). */
const FORCE_SALES = [
  "Mr Ahsaan",
  "Maira",
  "Zunaira",
  "Awais",
  "Malika",
  "Talha",
  "Naimal",
  "Ashir",
  "Izza",
];

/** Names that should be Team Lead-Sales. */
const FORCE_LEAD = ["Ahmad Amjad"];

async function main() {
  for (const name of FORCE_LEAD) {
    const r = await p.employee.updateMany({
      where: { name },
      data: { role: "Team Lead-Sales" },
    });
    console.log(name, "→ Team Lead-Sales  (rows:", r.count + ")");
  }
  for (const name of FORCE_SALES) {
    const r = await p.employee.updateMany({
      where: { name },
      data: { role: "Sales" },
    });
    console.log(name, "→ Sales  (rows:", r.count + ")");
  }

  // Also canonicalize any exact case variants already in DB
  const all = await p.employee.findMany();
  for (const e of all) {
    if (!e.role) continue;
    const lower = e.role.trim().toLowerCase();
    let canon: string | null = null;
    if (lower === "sales" || lower === "sale") canon = "Sales";
    else if (
      lower === "team lead-sales" ||
      lower === "team lead sales" ||
      lower === "teamlead-sales" ||
      lower === "team-lead-sales"
    ) {
      canon = "Team Lead-Sales";
    }
    if (canon && canon !== e.role) {
      await p.employee.update({ where: { id: e.id }, data: { role: canon } });
      console.log("canonicalized", e.name, e.role, "→", canon);
    }
  }

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
