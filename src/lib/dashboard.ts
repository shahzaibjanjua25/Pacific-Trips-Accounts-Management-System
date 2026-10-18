import { prisma } from "./prisma";

export async function getDashboardData(periodId: string) {
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

  const clientOutstanding = receivables.reduce(
    (s, r) => s + r.remainingAmount,
    0
  );
  const overdueReceivables = receivables
    .filter((r) => r.daysOverdue > 0)
    .reduce((s, r) => s + r.remainingAmount, 0);
  const openClients = receivables.filter(
    (r) => r.status === "Open" || r.status === "Partial"
  ).length;
  const totalPackageValue = receivables.reduce((s, r) => s + r.totalPackage, 0);
  const totalReceived = receivables.reduce((s, r) => s + r.amountReceived, 0);

  const employeeLoansTotal = employeeLoans.reduce(
    (s, l) => s + l.originalAmount,
    0
  );
  const leftoverLoans = employeeLoans.reduce(
    (s, l) => s + l.remainingAmount,
    0
  );

  const supplierRemaining = payables.reduce((s, p) => s + p.remaining, 0);
  const overduePayables = payables
    .filter((p) => p.daysOverdue > 0)
    .reduce((s, p) => s + p.remaining, 0);
  const salaryPayable = payroll.reduce(
    (s, p) => s + Math.max(0, p.netPayable - (p.amountPaid ?? 0)),
    0
  );
  const hotelRemaining = hotels.reduce(
    (s, h) => s + (h.payable?.remaining ?? 0),
    0
  );
  const commissionsRemaining = commissions
    .filter((c) => c.status === "Accrued")
    .reduce((s, c) => s + c.commissionAmt, 0);
  const refundsPending = refunds.reduce((s, r) => s + r.amount, 0);
  const liabilitiesOutstanding = liabilities.reduce(
    (s, l) => s + l.outstanding,
    0
  );

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
  const commissionsAccrued = commissions.reduce(
    (s, c) => s + c.commissionAmt,
    0
  );
  const totalMonthlyExp = officeTotal + marketingTotal + salariesTotal;

  // Revenue = total sale value of receivables in this period
  const revenue = receivables.reduce((s, r) => s + r.totalPackage, 0);

  // Direct trip costs = hotel + transport + ticketing payables in period
  const directCosts = payables
    .filter(
      (p) =>
        p.category === "Hotel" ||
        p.category === "Transport" ||
        p.category === "Ticketing"
    )
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
      hbl:
        bankBalances.find((b) => b.accountName.includes("HBL"))?.balance ?? 0,
      faysal:
        bankBalances.find((b) => b.accountName.includes("Faysal"))?.balance ??
        0,
      meezan:
        bankBalances.find((b) => b.accountName.includes("Meezan"))?.balance ??
        0,
      ubl:
        bankBalances.find((b) => b.accountName.includes("UBL"))?.balance ?? 0,
      easypaisa:
        bankBalances.find((b) => b.accountName.includes("Easypaisa"))
          ?.balance ?? 0,
      jazzcash:
        bankBalances.find((b) => b.accountName.includes("Jazzcash"))
          ?.balance ?? 0,
      totalBank,
      pettyCash: 0,
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
      supplierAdvances: 0,
      employeeLoans: leftoverLoans,
      assets: assetsTotal,
      vadets: 0,
      ownerCapital: 0,
      ownerWithdrawals: 0,
      total: leftoverLoans + assetsTotal,
    },
    profitability: {
      tripRevenue: revenue,
      directTripCosts: directCosts,
      grossTripProfit: revenue - directCosts,
      netTripProfit: revenue - directCosts,
      operatingExpenses: operatingExp,
      netProfit,
      marginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    },
    operations: {
      hotelsTotalCost: hotelBookingCost,
      hotelsRemaining: hotelRemaining,
      transportAgreed,
      transportSettlement,
      transportRemaining,
      ticketingPaid: 0,
      ticketingCharged: 0,
      ticketingProfit: 0,
    },
    activity: {
      totalDebits,
      totalCredits,
      balanceCheck: totalDebits - totalCredits,
      basicSalaries: payroll.reduce((s, p) => s + p.basicSalary, 0),
      taxDeducted: payroll.reduce((s, p) => s + p.taxDeducted, 0),
      staffAdvances: 0,
      commissionsEligible: commissionsAccrued,
    },
    ratios: {
      cashPlusReceivables: totalBank + clientOutstanding,
      cashPlusAllOwed: totalBank + clientOutstanding + leftoverLoans,
      totalWeOwe,
      netPosition: totalBank + clientOutstanding + leftoverLoans - totalWeOwe,
      assetsPlusCash: totalBank + assetsTotal,
      salaryPctOfRevenue: revenue > 0 ? (salariesTotal / revenue) * 100 : 0,
      monthlyExpPctOfRevenue:
        revenue > 0 ? (totalMonthlyExp / revenue) * 100 : 0,
    },
  };
}