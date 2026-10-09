import { prisma } from "./prisma";
import { monthLabel } from "./utils";

export async function getOrCreatePeriod(year: number, month: number) {
  const label = monthLabel(year, month);
  let period = await prisma.period.findUnique({
    where: { year_month: { year, month } },
  });
  if (!period) {
    period = await prisma.period.create({
      data: { year, month, label },
    });
  }
  return period;
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
