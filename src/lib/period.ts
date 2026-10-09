import { prisma } from "./prisma";
import { monthLabel } from "./utils";
import { getOrCreatePeriodWithCarryForward } from "./carry-forward";

export async function getOrCreatePeriod(year: number, month: number) {
  const { period } = await getOrCreatePeriodWithCarryForward(year, month);
  return period;
}

/** Create period without error if exists; always runs carry-forward only on create */
export async function createPeriod(year: number, month: number) {
  return getOrCreatePeriodWithCarryForward(year, month);
}

export async function getCurrentPeriod() {
  const now = new Date();
  return getOrCreatePeriod(now.getFullYear(), now.getMonth() + 1);
}

export async function listPeriods() {
  return prisma.period.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
}

export async function getPeriodById(id: string) {
  return prisma.period.findUnique({ where: { id } });
}

export { monthLabel };
