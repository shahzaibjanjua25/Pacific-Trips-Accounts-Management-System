import { prisma } from "./prisma";
import { monthLabel } from "./utils";
import { getOrCreatePeriodWithCarryForward } from "./carry-forward";

export async function createPeriod(year: number, month: number, carryForward: boolean) {
  return getOrCreatePeriodWithCarryForward(year, month, carryForward);
}

export function listPeriods() {
  return prisma.period.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] });
}

export async function resolveActivePeriod(requestedId?: string) {
  const periods = await listPeriods();
  return { periods, current: periods.find((period) => period.id === requestedId) ?? periods.at(0) };
}

export function accountingMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi", year: "numeric", month: "numeric",
  }).formatToParts(now);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export function canCloseMonth(year: number, month: number, now = new Date()) {
  const current = accountingMonth(now);
  return year * 12 + month < current.year * 12 + current.month;
}

export { monthLabel };
