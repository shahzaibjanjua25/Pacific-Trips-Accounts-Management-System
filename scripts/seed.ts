import { runSeed } from "../src/lib/seed";
import { prisma } from "../src/lib/prisma";

async function main() {
  const force = process.argv.includes("--force");
  if (process.env.NODE_ENV === "production" && !force) {
    throw new Error("Production demo seeding requires --force.");
  }
  const result = await runSeed(force);
  console.log(result.message);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
