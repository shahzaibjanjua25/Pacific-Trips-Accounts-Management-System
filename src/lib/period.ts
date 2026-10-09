import { prisma } from "./prisma";
import { monthLabel } from "./utils";
import { getOrCreatePeriodWithCarryForward } from "./carry-forward";

/**
 * ONLY use from API when a user explicitly wants to switch/create a period.
 * Do NOT call from page reads — use `listPeriods` + `getPeriodById` instead.
 */
export async function getOrCreatePeriod(year: number, month: number) {
  const { period } = await getOrCreatePeriodWithCarryForward(year, month);
  return period;
}

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

/**
 * Page-level resolver — does NOT create periods as a side effect.
 * If no periods exist at all, bootstrap the current month once.
 */
export async function resolveActivePeriod(requestedId?: string) {
  let periods = await listPeriods();
  if (periods.length === 0) {
    const now = new Date();
    const { period } = await getOrCreatePeriodWithCarryForward(
      now.getFullYear(),
      now.getMonth() + 1
    );
    periods = await listPeriods();
    return { periods, current: period };
  }
  const current = requestedId
    ? periods.find((p) => p.id === requestedId) ?? periods[0]
    : periods[0];
  return { periods, current };
}

export async function getPeriodById(id: string) {
  return prisma.period.findUnique({ where: { id } });
}

export { monthLabel };