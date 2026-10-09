import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const periods = await prisma.period.findMany({ orderBy: { year: "asc" } });
  // Sort by year/month ascending so we process chronologically
  periods.sort((a, b) =>
    a.year === b.year ? a.month - b.month : a.year - b.year
  );

  for (const period of periods) {
    const payroll = await prisma.payrollEntry.findMany({
      where: { periodId: period.id, status: "Paid" },
    });

    for (const p of payroll) {
      if (!p.employeeId || p.loanInstallment <= 0) continue;
      const loan = await prisma.employeeLoan.findFirst({
        where: { employeeId: p.employeeId },
      });
      if (!loan) continue;

      const newRem = Math.max(0, loan.remainingAmount - p.loanInstallment);
      if (newRem === loan.remainingAmount) continue;

      await prisma.employeeLoan.update({
        where: { id: loan.id },
        data: { remainingAmount: newRem },
      });
      console.log(
        `${period.label} · ${p.employeeName}: loan ${loan.remainingAmount} → ${newRem}`
      );
    }
  }
  console.log("Backfill done.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());