import { prisma } from "./prisma";

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;

async function loadOneMonth(periodId: string) {
  const [
    bankBalances,
    receivables,
    payables,
    payroll,
    officeExp,
    marketingExp,
    assets,
    employeeLoans,
    refunds,
    commissions,
    hotels,
    transport,
    transactions,
    liabilities,
  ] = await Promise.all([
    prisma.bankBalance.findMany(),
    prisma.receivable.findMany({ where: { periodId } }),
    prisma.payable.findMany({ where: { periodId } }),
    prisma.payrollEntry.findMany({ where: { periodId } }),
    prisma.officeExpense.findMany({ where: { periodId } }),
    prisma.marketingExpense.findMany({ where: { periodId } }),
    prisma.asset.findMany(),
    prisma.employeeLoan.findMany(),
    prisma.refund.findMany({ where: { periodId, status: "Pending" } }),
    prisma.commission.findMany({ where: { periodId } }),
    prisma.hotelBooking.findMany({
      where: { periodId },
      include: { payable: true },
    }),
    prisma.transportJob.findMany({
      where: { periodId },
      include: { payable: true },
    }),
    prisma.transaction.findMany({ where: { periodId } }),
    prisma.liability.findMany({ where: { periodId } }),
  ]);

  const totalBank = bankBalances.reduce((s, b) => s + b.balance, 0);

  const clientOutstanding = receivables.reduce((s, r) => s + r.remainingAmount, 0);
  const overdueReceivables = receivables
    .filter((r) => r.daysOverdue > 0)
    .reduce((s, r) => s + r.remainingAmount, 0);
  const openClients = receivables.filter(
    (r) => r.status === "Open" || r.status === "Partial"
  ).length;
  const totalPackageValue = receivables.reduce((s, r) => s + r.totalPackage, 0);
  const totalReceived = receivables.reduce((s, r) => s + r.amountReceived, 0);

  const employeeLoansTotal = employeeLoans.reduce((s, l) => s + l.originalAmount, 0);
  const leftoverLoans = employeeLoans.reduce((s, l) => s + l.remainingAmount, 0);

  const supplierRemaining = payables.reduce((s, p) => s + p.remaining, 0);
  const overduePayables = payables
    .filter((p) => p.daysOverdue > 0)
    .reduce((s, p) => s + p.remaining, 0);
  const salaryPayable = payroll.reduce(
    (s, p) => s + Math.max(0, p.netPayable - (p.amountPaid ?? 0)),
    0
  );
  const hotelRemaining = hotels.reduce((s, h) => s + (h.payable?.remaining ?? 0), 0);
  const commissionsRemaining = commissions
    .filter((c) => c.status === "Accrued")
    .reduce((s, c) => s + c.commissionAmt, 0);
  const refundsPending = refunds.reduce((s, r) => s + r.amount, 0);
  const liabilitiesOutstanding = liabilities.reduce((s, l) => s + l.outstanding, 0);

  const totalWeOwe =
    supplierRemaining +
    salaryPayable +
    hotelRemaining +
    commissionsRemaining +
    refundsPending +
    liabilitiesOutstanding;

  const officeTotal = officeExp.reduce((s, e) => s + e.amount, 0);
  const marketingTotal = marketingExp.reduce((s, e) => s + e.amount, 0);
  const salariesTotal = payroll.reduce((s, p) => s + p.netPayable, 0);
  const loanInstallments = payroll.reduce((s, p) => s + p.loanInstallment, 0);
  const commissionsAccrued = commissions.reduce((s, c) => s + c.commissionAmt, 0);
  const totalMonthlyExp = officeTotal + marketingTotal + salariesTotal;

  const revenue = receivables.reduce((s, r) => s + r.totalPackage, 0);
  const directCosts = payables
    .filter((p) => p.category === "Hotel" || p.category === "Transport")
    .reduce((s, p) => s + p.originalAmount, 0);
  const operatingExp = officeTotal + marketingTotal + salariesTotal;
  const netProfit = revenue - directCosts - operatingExp;

  const totalDebits = transactions.reduce((s, t) => s + t.debit, 0);
  const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);

  const assetsTotal = assets.reduce((s, a) => s + a.purchaseCost, 0);

  const hotelBookingCost = hotels.reduce(
    (s, h) => s + (h.payable?.originalAmount ?? 0),
    0
  );
  const transportAgreed = transport.reduce(
    (s, t) => s + (t.payable?.originalAmount ?? 0),
    0
  );
  const transportSettlement = transport.reduce(
    (s, t) => s + (t.payable?.amountPaid ?? 0),
    0
  );
  const transportRemaining = transport.reduce(
    (s, t) => s + (t.payable?.remaining ?? 0),
    0
  );

  const expectedCollections7d = receivables
    .filter((r) => {
      if (!r.dueDate) return false;
      const due = new Date(r.dueDate).getTime();
      const wk = Date.now() + 7 * 24 * 60 * 60 * 1000;
      return due <= wk && r.remainingAmount > 0;
    })
    .reduce((s, r) => s + r.remainingAmount, 0);

  const freeCash = totalBank + expectedCollections7d - totalWeOwe;

  return {
    cash: {
      hbl: bankBalances.find((b) => b.accountName.includes("HBL"))?.balance ?? 0,
      faysal: bankBalances.find((b) => b.accountName.includes("Faysal"))?.balance ?? 0,
      meezan: bankBalances.find((b) => b.accountName.includes("Meezan"))?.balance ?? 0,
      ubl: bankBalances.find((b) => b.accountName.includes("UBL"))?.balance ?? 0,
      easypaisa: bankBalances.find((b) => b.accountName.includes("Easypaisa"))?.balance ?? 0,
      jazzcash: bankBalances.find((b) => b.accountName.includes("Jazzcash"))?.balance ?? 0,
      totalBank,
      totalAvailable: totalBank,
      expectedCollections7d,
      committed: totalWeOwe,
      freeCash,
    },
    receivables: {
      clientOutstanding,
      overdue: overdueReceivables,
      openClients,
      totalPackageValue,
      totalReceived,
      employeeLoans: employeeLoansTotal,
      leftoverLoans,
      totalOwedToCompany: clientOutstanding + leftoverLoans,
    },
    payables: {
      supplierRemaining,
      overdue: overduePayables,
      salaryPayable,
      hotelRemaining,
      otherLiabilities: liabilitiesOutstanding,
      commissionsRemaining,
      refundsPending,
      totalWeOwe,
    },
    monthlyExpenses: {
      office: officeTotal,
      marketing: marketingTotal,
      salaries: salariesTotal,
      loanInstallments,
      commissionsAccrued,
      total: totalMonthlyExp,
      pctOfRevenue: revenue > 0 ? (totalMonthlyExp / revenue) * 100 : 0,
    },
    oneTime: {
      employeeLoans: leftoverLoans,
      assets: assetsTotal,
      total: leftoverLoans + assetsTotal,
    },
    profitability: {
      revenue,
      directCosts,
      grossProfit: revenue - directCosts,
      operatingExpenses: operatingExp,
      netProfit,
      marginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
      grossMarginPct: revenue > 0 ? ((revenue - directCosts) / revenue) * 100 : 0,
    },
    operations: {
      hotelsTotalCost: hotelBookingCost,
      hotelsRemaining: hotelRemaining,
      transportAgreed,
      transportSettlement,
      transportRemaining,
    },
    activity: {
      totalDebits,
      totalCredits,
      balanceCheck: totalDebits - totalCredits,
      basicSalaries: payroll.reduce((s, p) => s + p.basicSalary, 0),
      taxDeducted: payroll.reduce((s, p) => s + p.taxDeducted, 0),
      commissionsEligible: commissionsAccrued,
    },
    ratios: {
      cashPlusReceivables: totalBank + clientOutstanding,
      cashPlusAllOwed: totalBank + clientOutstanding + leftoverLoans,
      totalWeOwe,
      netPosition: totalBank + clientOutstanding + leftoverLoans - totalWeOwe,
      assetsPlusCash: totalBank + assetsTotal,
      salaryPctOfRevenue: revenue > 0 ? (salariesTotal / revenue) * 100 : 0,
      monthlyExpPctOfRevenue: revenue > 0 ? (totalMonthlyExp / revenue) * 100 : 0,
    },
    // raw lists used by the "attention" & compact tables
    _raw: {
      receivables: receivables
        .map((r) => ({
          id: r.id,
          clientName: r.clientName,
          remainingAmount: r.remainingAmount,
          daysOverdue: r.daysOverdue,
          dueDate: r.dueDate,
          totalPackage: r.totalPackage,
          salesperson: r.salesperson,
        }))
        .sort((a, b) => b.remainingAmount - a.remainingAmount),
      payables: payables
        .map((p) => ({
          id: p.id,
          supplierName: p.supplierName,
          category: p.category,
          remaining: p.remaining,
          daysOverdue: p.daysOverdue,
          dueDate: p.dueDate,
          originalAmount: p.originalAmount,
        }))
        .sort((a, b) => b.remaining - a.remaining),
      payroll: payroll.map((p) => ({
        employeeName: p.employeeName,
        netPayable: p.netPayable,
        amountPaid: p.amountPaid,
        remaining: Math.max(0, p.netPayable - (p.amountPaid ?? 0)),
      })),
      refunds: refunds.map((r) => ({
        clientName: r.clientName,
        amount: r.amount,
        reason: r.reason,
      })),
    },
  };
}

async function getPreviousPeriods(
  currentYear: number,
  currentMonth: number,
  count: number
) {
  const periods = await prisma.period.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: count + 1,
  });
  // Move past the current month
  const prior = periods.filter(
    (p) =>
      p.year < currentYear ||
      (p.year === currentYear && p.month < currentMonth)
  );
  return prior.slice(0, count);
}

export async function getDashboardData(periodId: string) {
  const current = await prisma.period.findUnique({ where: { id: periodId } });
   if (!current) {
    return {
      current: await loadOneMonth(periodId),
      trends: [] as Awaited<ReturnType<typeof loadOneMonth>>[],
      trendPeriods: [] as {
        id: string;
        year: number;
        month: number;
        label: string;
        isClosed: boolean;
        createdAt: Date;
        updatedAt: Date;
      }[],
      period: { year: 0, month: 0, label: "Unknown" },
    };
  }

  const trendPeriods = await getPreviousPeriods(
    current.year,
    current.month,
    3
  );

  const [currentData, ...trendData] = await Promise.all([
    loadOneMonth(periodId),
    ...trendPeriods.map((p) => loadOneMonth(p.id)),
  ]);

  return {
    current: currentData,
    trends: trendData,
    trendPeriods,
    period: {
      year: current.year,
      month: current.month,
      label: current.label,
    },
  };
}

/** Sum a column across trends for sparkline helpers */
export function trendSeries(
  currentValue: number,
  trends: Awaited<ReturnType<typeof loadOneMonth>>[],
  extract: (d: Awaited<ReturnType<typeof loadOneMonth>>) => number
): number[] {
  const past = trends.map(extract).reverse();
  return [...past, currentValue];
}