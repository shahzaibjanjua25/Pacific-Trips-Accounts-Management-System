import { prisma } from "./prisma";

export async function getDashboardData(periodId: string) {
  const [
    bankBalances,
    pettyCash,
    receivables,
    payables,
    payroll,
    officeExp,
    marketingExp,
    trips,
    assets,
    vadets,
    employeeLoans,
    refunds,
    commissions,
    hotels,
    transport,
    ticketing,
    supplierAdvances,
    transactions,
    ownerTxns,
    liabilities,
  ] = await Promise.all([
    prisma.bankBalance.findMany(),
    prisma.pettyCashTxn.findMany({
      where: { periodId },
      orderBy: { date: "desc" },
      take: 1,
    }),
    prisma.receivable.findMany({ where: { periodId } }),
    prisma.payable.findMany({ where: { periodId } }),
    prisma.payrollEntry.findMany({ where: { periodId } }),
    prisma.officeExpense.findMany({ where: { periodId } }),
    prisma.marketingExpense.findMany({ where: { periodId } }),
    prisma.trip.findMany({ where: { periodId } }),
    prisma.asset.findMany(),
    prisma.vadet.findMany({ where: { periodId } }),
    prisma.employeeLoan.findMany(),
    prisma.refund.findMany({ where: { periodId, status: "Pending" } }),
    prisma.commission.findMany({ where: { periodId } }),
    prisma.hotelBooking.findMany({ where: { periodId }, include: { payable: true } }),
    prisma.transportJob.findMany({ where: { periodId }, include: { payable: true } }),
    prisma.ticketing.findMany({ where: { periodId } }),
    prisma.supplierAdvance.findMany({ where: { periodId } }),
    prisma.transaction.findMany({ where: { periodId } }),
    prisma.ownerTxn.findMany({ where: { periodId } }),
    prisma.liability.findMany({ where: { periodId } }),
  ]);

  const totalBank = bankBalances.reduce((s, b) => s + b.balance, 0);
  const pettyCashBal = pettyCash[0]?.balanceAfter ?? 0;
  const totalAvailableCash = totalBank + pettyCashBal;

  const clientOutstanding = receivables.reduce((s, r) => s + r.remainingAmount, 0);
  const overdueReceivables = receivables
    .filter((r) => r.daysOverdue > 0)
    .reduce((s, r) => s + r.remainingAmount, 0);
  const openClients = receivables.filter((r) => r.status === "Open" || r.status === "Partial").length;
  const totalPackageValue = receivables.reduce((s, r) => s + r.totalPackage, 0);
  const totalReceived = receivables.reduce((s, r) => s + r.amountReceived, 0);

  const employeeLoansTotal = employeeLoans.reduce((s, l) => s + l.originalAmount, 0);
  const leftoverLoans = employeeLoans.reduce((s, l) => s + l.remainingAmount, 0);

  const supplierRemaining = payables.reduce((s, p) => s + p.remaining, 0);
  const overduePayables = payables
    .filter((p) => p.daysOverdue > 0)
    .reduce((s, p) => s + p.remaining, 0);

  // NEW: salary payable = sum of outstanding (net − amountPaid)
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

  const tripRevenue = trips.reduce((s, t) => s + t.packageRevenue, 0);
  const directTripCosts = trips.reduce((s, t) => s + t.totalDirectCost, 0);
  const grossTripProfit = trips.reduce((s, t) => s + t.grossProfit, 0);
  const netTripProfit = trips.reduce((s, t) => s + t.netProfit, 0);
  const netProfit = netTripProfit - totalMonthlyExp;

  const totalDebits = transactions.reduce((s, t) => s + t.debit, 0);
  const totalCredits = transactions.reduce((s, t) => s + t.credit, 0);

  const assetsTotal = assets.reduce((s, a) => s + a.purchaseCost, 0);
  const vadetsTotal = vadets.reduce((s, v) => s + v.amount, 0);

  const hotelBookingCost = hotels.reduce((s, h) => s + (h.payable?.originalAmount ?? 0), 0);
  const transportAgreed = transport.reduce((s, t) => s + (t.payable?.originalAmount ?? 0), 0);
  const transportSettlement = transport.reduce((s, t) => s + (t.payable?.amountPaid ?? 0), 0);
  const ticketingPaid = ticketing.reduce((s, t) => s + t.ticketCost, 0);
  const ticketingCharged = ticketing.reduce((s, t) => s + t.chargedToClient, 0);
  const ticketingProfit = ticketing.reduce((s, t) => s + t.profit, 0);

  const committed = totalWeOwe;
  const expectedCollections7d = receivables
    .filter((r) => {
      if (!r.dueDate) return false;
      const due = new Date(r.dueDate).getTime();
      const wk = Date.now() + 7 * 24 * 60 * 60 * 1000;
      return due <= wk && r.remainingAmount > 0;
    })
    .reduce((s, r) => s + r.remainingAmount, 0);
  const freeCash = totalAvailableCash + expectedCollections7d - committed;

  const ownerCapital = ownerTxns.reduce((s, t) => s + t.amountIn, 0);
  const ownerWithdrawals = ownerTxns.reduce((s, t) => s + t.amountOut, 0);

  return {
    cash: {
      hbl: bankBalances.find((b) => b.accountName.includes("HBL"))?.balance ?? 0,
      meezan:
        bankBalances.find(
          (b) => b.accountName.includes("Meezan") || b.accountName.includes("Faisal")
        )?.balance ?? 0,
      totalBank,
      pettyCash: pettyCashBal,
      totalAvailable: totalAvailableCash,
      expectedCollections7d,
      committed,
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
      pctOfRevenue: tripRevenue > 0 ? (totalMonthlyExp / tripRevenue) * 100 : 0,
    },
    oneTime: {
      supplierAdvances: supplierAdvances.reduce((s, a) => s + a.remaining, 0),
      employeeLoans: leftoverLoans,
      assets: assetsTotal,
      vadets: vadetsTotal,
      ownerCapital,
      ownerWithdrawals,
      total: leftoverLoans + assetsTotal,
    },
    profitability: {
      tripRevenue,
      directTripCosts,
      grossTripProfit,
      netTripProfit,
      operatingExpenses: totalMonthlyExp,
      netProfit,
      marginPct: tripRevenue > 0 ? (netProfit / tripRevenue) * 100 : 0,
    },
    operations: {
      hotelsTotalCost: hotelBookingCost,
      hotelsRemaining: hotelRemaining,
      transportAgreed,
      transportSettlement,
      ticketingPaid,
      ticketingCharged,
      ticketingProfit,
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
      cashPlusReceivables: totalAvailableCash + clientOutstanding,
      cashPlusAllOwed: totalAvailableCash + clientOutstanding + leftoverLoans,
      totalWeOwe,
      netPosition: totalAvailableCash + clientOutstanding + leftoverLoans - totalWeOwe,
      assetsPlusCash: totalAvailableCash + assetsTotal,
      salaryPctOfRevenue: tripRevenue > 0 ? (salariesTotal / tripRevenue) * 100 : 0,
      monthlyExpPctOfRevenue:
        tripRevenue > 0 ? (totalMonthlyExp / tripRevenue) * 100 : 0,
    },
  };
}