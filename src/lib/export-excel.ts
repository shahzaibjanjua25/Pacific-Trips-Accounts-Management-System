import ExcelJS from "exceljs";
import { prisma } from "./prisma";

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF1E3A5F" },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: "FFFFFFFF" },
  size: 11,
};
const TITLE_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  size: 14,
  color: { argb: "FF1E3A5F" },
};
const MONEY_FMT = "#,##0";
const DATE_FMT = "dd-mmm-yyyy";

function styleHeader(row: ExcelJS.Row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      left: { style: "thin", color: { argb: "FFCCCCCC" } },
      right: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });
  row.height = 22;
}

function addSheet(
  wb: ExcelJS.Workbook,
  name: string,
  title: string,
  headers: string[],
  rows: unknown[][],
  moneyCols: number[] = [],
  dateCols: number[] = []
) {
  const ws = wb.addWorksheet(name.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 2 }],
  });

  ws.mergeCells(1, 1, 1, Math.max(headers.length, 1));
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;

  const headerRow = ws.addRow(headers);
  styleHeader(headerRow);

  for (const r of rows) {
    const row = ws.addRow(r);
    row.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: "hair", color: { argb: "FFE0E0E0" } },
        bottom: { style: "hair", color: { argb: "FFE0E0E0" } },
        left: { style: "hair", color: { argb: "FFE0E0E0" } },
        right: { style: "hair", color: { argb: "FFE0E0E0" } },
      };
      if (moneyCols.includes(colNumber)) {
        cell.numFmt = MONEY_FMT;
        cell.alignment = { horizontal: "right" };
      }
      if (dateCols.includes(colNumber) && cell.value) {
        cell.numFmt = DATE_FMT;
      }
    });
  }

  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(Math.max(h.length + 2, 12), 28);
  });

  if (headers.length > 0 && rows.length > 0) {
    ws.autoFilter = {
      from: { row: 2, column: 1 },
      to: { row: 2 + rows.length, column: headers.length },
    };
  }

  return ws;
}

export async function buildAccountingWorkbook(periodId: string) {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Period not found");

  const [
    allPeriods,
    txns,
    txnLinks,
    clients,
    clientLedgers,
    receivables,
    trips,
    payables,
    hotels,
    transport,
    ticketing,
    advances,
    refunds,
    employees,
    employeeLoans,
    payroll,
    commissions,
    office,
    marketing,
    petty,
    banks,
    bankAccounts,
    bankTxns,
    assets,
    liabilities,
    owner,
    vadets,
    salesPerformance,
    salesTarget,
    balanceSheetLines,
    monthlyClosings,
    cashFlowSnapshots,
    companySettings,
  ] = await Promise.all([
    prisma.period.findMany({ orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.transaction.findMany({ where: { periodId }, orderBy: { date: "asc" } }),
    prisma.transactionLink.findMany({
      where: { periodId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({ orderBy: { name: "asc" } }),
    prisma.clientLedger.findMany({ orderBy: { tourDate: "asc" } }),
    prisma.receivable.findMany({ where: { periodId } }),
    prisma.trip.findMany({ where: { periodId } }),
    prisma.payable.findMany({ where: { periodId } }),
    prisma.hotelBooking.findMany({
      where: { periodId },
      include: { payable: true },
    }),
    prisma.transportJob.findMany({
      where: { periodId },
      include: { payable: true },
    }),
    prisma.ticketing.findMany({ where: { periodId } }),
    prisma.supplierAdvance.findMany({ where: { periodId } }),
    prisma.refund.findMany({ where: { periodId } }),
    prisma.employee.findMany({ orderBy: { name: "asc" } }),
    prisma.employeeLoan.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.payrollEntry.findMany({ where: { periodId } }),
    prisma.commission.findMany({ where: { periodId } }),
    prisma.officeExpense.findMany({ where: { periodId } }),
    prisma.marketingExpense.findMany({ where: { periodId } }),
    prisma.pettyCashTxn.findMany({ where: { periodId } }),
    prisma.bankBalance.findMany(),
    prisma.bankAccount.findMany().catch(() => []),
    prisma.bankTxn
      .findMany({ where: { periodId }, orderBy: { date: "asc" } })
      .catch(() => []),
    prisma.asset.findMany(),
    prisma.liability.findMany({ where: { periodId } }),
    prisma.ownerTxn.findMany({ where: { periodId } }),
    prisma.vadet.findMany({ where: { periodId } }),
    prisma.salesPerformance.findMany({ where: { periodId } }),
    prisma.salesTarget.findUnique({ where: { periodId } }),
    prisma.balanceSheetLine
      .findMany({
        where: { periodId },
        orderBy: [{ section: "asc" }, { sortOrder: "asc" }],
      })
      .catch(() => []),
    prisma.monthlyClosing.findMany({ where: { periodId } }).catch(() => []),
    prisma.cashFlowSnapshot.findMany({ where: { periodId } }).catch(() => []),
    prisma.companySettings.findFirst().catch(() => null),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pacific Trips Accounting System";
  wb.created = new Date();
  wb.title = `Pacific Trips — ${period.label}`;

  // ── Cover / Instructions ──
  const cover = wb.addWorksheet("Instructions");
  cover.getCell("A1").value = "PACIFIC TRIPS — COMPLETE ACCOUNTING SYSTEM";
  cover.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1E3A5F" } };
  cover.getCell("A2").value = `Period: ${period.label} | Lahore, Pakistan | All figures in PKR | Confidential`;
  cover.getCell("A4").value =
    "Complete export — every table from the Pacific Trips database for this period (plus global master data).";
  cover.getCell("A6").value = "HOW TO USE";
  cover.getCell("A6").font = { bold: true };
  cover.getCell("A7").value = "1. Every sheet is one database table.";
  cover.getCell("A8").value =
    "2. Green header row = column titles. Numbers formatted as PKR.";
  cover.getCell("A9").value =
    "3. Filters enabled on data sheets. Frozen header rows.";
  cover.getCell("A10").value =
    "4. Period-scoped tables show this month. Master tables (Clients, Employees, Assets) show all.";
  cover.getCell("A12").value = "WHO CLOSED WHICH SALE";
  cover.getCell("A12").font = { bold: true };
  cover.getCell("A13").value =
    "   • SalesAttribution  → one row per closed sale, sorted by salesperson";
  cover.getCell("A14").value =
    "   • SalesPerformance  → raw sales entry data (has Employee Name)";
  cover.getCell("A15").value =
    "   • Receivables       → per-client salesperson column";
  cover.getCell("A16").value =
    "   • Clients           → derived salesperson (most recent receivable)";
  cover.getCell("A17").value =
    "   • ClientLedger      → derived salesperson per ledger row";
  cover.getColumn(1).width = 90;

  // ══════════════════════════════════════════════════════════════════
  // PERIOD-SCOPED TABLES
  // ══════════════════════════════════════════════════════════════════

  addSheet(
    wb,
    "Transactions",
    `Daily Transactions / General Ledger — ${period.label}`,
    [
      "Date",
      "Txn ID",
      "Description",
      "Category",
      "Sub-Category",
      "Client/Vendor",
      "Trip Ref",
      "Debit (PKR)",
      "Credit (PKR)",
      "Payment Method",
      "Bank/Cash Account",
      "Status",
      "Entered By",
      "Notes",
    ],
    txns.map((t) => [
      t.date,
      t.txnId,
      t.description,
      t.category,
      t.subCategory,
      t.party,
      t.tripRef,
      t.debit,
      t.credit,
      t.paymentMethod,
      t.bankAccount,
      t.status,
      t.enteredBy,
      t.notes,
    ]),
    [8, 9],
    [1]
  );

  addSheet(
    wb,
    "TransactionLinks",
    `Transaction Links — ${period.label}`,
    ["Created", "Transaction ID", "Entity Type", "Entity ID", "Applied Amount (PKR)"],
    txnLinks.map((l) => [
      l.createdAt,
      l.transactionId,
      l.entityType,
      l.entityId,
      l.appliedAmount,
    ]),
    [5],
    [1]
  );

  addSheet(
    wb,
    "Receivables",
    `Client Receivables — ${period.label}`,
    [
      "Client Name",
      "Salesperson",
      "Contact",
      "Booking Date",
      "Trip Dates",
      "Destination",
      "Total Package",
      "Amount to Receive",
      "Amount Received",
      "Remaining",
      "Due Date",
      "Days Overdue",
      "Trip Start",
      "Discounts",
      "Additional Charges",
      "Final Settlement",
      "Status",
      "Notes",
    ],
    receivables.map((r) => [
      r.clientName,
      r.salesperson,
      r.contact,
      r.bookingDate,
      r.tripDates,
      r.destination,
      r.totalPackage,
      r.amountToReceive,
      r.amountReceived,
      r.remainingAmount,
      r.dueDate,
      r.daysOverdue,
      r.tripStart,
      r.discounts,
      r.additionalCharges,
      r.finalSettlement,
      r.status,
      r.notes,
    ]),
    [7, 8, 9, 10, 15, 16, 17],
    [4, 11, 13]
  );

  addSheet(
    wb,
    "TripPnL",
    `Trip Profit & Loss — ${period.label}`,
    [
      "Client",
      "Salesperson",
      "Trip Ref",
      "Destination",
      "Start",
      "End",
      "Package Revenue",
      "Hotel Cost",
      "Transport Cost",
      "Ticketing Cost",
      "Other Direct",
      "Total Direct",
      "Gross Profit",
      "Overhead Alloc",
      "Net Profit",
      "Status",
      "Notes",
    ],
    trips.map((t) => [
      t.clientName,
      t.salesperson,
      t.tripRef,
      t.destination,
      t.startDate,
      t.endDate,
      t.packageRevenue,
      t.hotelCost,
      t.transportCost,
      t.ticketingCost,
      t.otherDirectCost,
      t.totalDirectCost,
      t.grossProfit,
      t.overheadAlloc,
      t.netProfit,
      t.status,
      t.notes,
    ]),
    [7, 8, 9, 10, 11, 12, 13, 14, 15],
    [5, 6]
  );

  addSheet(
    wb,
    "Payables",
    `Supplier Payables — ${period.label}`,
    [
      "Supplier",
      "Category",
      "Description",
      "Invoice Ref",
      "Original Amount",
      "Amount Paid",
      "Remaining",
      "Due Date",
      "Days Overdue",
      "Status",
      "Trip Ref",
      "Notes",
    ],
    payables.map((p) => [
      p.supplierName,
      p.category,
      p.description,
      p.invoiceRef,
      p.originalAmount,
      p.amountPaid,
      p.remaining,
      p.dueDate,
      p.daysOverdue,
      p.status,
      p.relatedTrip,
      p.notes,
    ]),
    [5, 6, 7],
    [8]
  );

  addSheet(
    wb,
    "Hotels",
    `Hotels — ${period.label}`,
    [
      "Hotel",
      "Client",
      "Trip Ref",
      "Check In",
      "Check Out",
      "Nights",
      "Rooms",
      "Agreed Cost",
      "Paid",
      "Remaining",
      "Status",
      "Notes",
    ],
    hotels.map((h) => [
      h.hotelName,
      h.clientName,
      h.tripRef,
      h.checkIn,
      h.checkOut,
      h.nights,
      h.rooms,
      h.payable?.originalAmount ?? 0,
      h.payable?.amountPaid ?? 0,
      h.payable?.remaining ?? 0,
      h.status,
      h.notes,
    ]),
    [8, 9, 10],
    [4, 5]
  );

  addSheet(
    wb,
    "Transport",
    `Transport — ${period.label}`,
    [
      "Driver",
      "Vehicle",
      "Client",
      "Trip Ref",
      "Agreed Cost",
      "Fuel Cost",
      "Final Settlement",
      "Remaining",
      "Status",
      "Notes",
    ],
    transport.map((t) => [
      t.driverName,
      t.vehicle,
      t.clientName,
      t.tripRef,
      t.payable?.originalAmount ?? 0,
      t.fuelCost,
      t.payable?.amountPaid ?? 0,
      t.payable?.remaining ?? 0,
      t.status,
      t.notes,
    ]),
    [5, 6, 7, 8]
  );

  addSheet(
    wb,
    "Ticketing",
    `Ticketing — ${period.label}`,
    [
      "Airline",
      "Client",
      "Trip Ref",
      "Ticket Cost",
      "Charged to Client",
      "Profit",
      "Status",
      "Notes",
    ],
    ticketing.map((t) => [
      t.airline,
      t.clientName,
      t.tripRef,
      t.ticketCost,
      t.chargedToClient,
      t.profit,
      t.status,
      t.notes,
    ]),
    [4, 5, 6]
  );

  addSheet(
    wb,
    "SupplierAdvances",
    `Supplier Advances — ${period.label}`,
    ["Supplier", "Amount", "Adjusted", "Remaining", "Trip Ref", "Date Given", "Notes"],
    advances.map((a) => [
      a.supplierName,
      a.amount,
      a.adjustedAmount,
      a.remaining,
      a.relatedTrip,
      a.dateGiven,
      a.notes,
    ]),
    [2, 3, 4],
    [6]
  );

  addSheet(
    wb,
    "Refunds",
    `Refunds — ${period.label}`,
    ["Client", "Amount", "Reason", "Status", "Paid Date", "Trip Ref", "Notes"],
    refunds.map((r) => [
      r.clientName,
      r.amount,
      r.reason,
      r.status,
      r.paidDate,
      r.tripRef,
      r.notes,
    ]),
    [2],
    [5]
  );

  addSheet(
    wb,
    "Payroll",
    `Payroll — ${period.label}`,
    [
      "Employee",
      "Basic Salary",
      "Bonus",
      "Tax Deducted",
      "Loan Installment",
      "Other Deductions",
      "Net Payable",
      "Amount Paid",
      "Remaining",
      "Status",
      "Paid Date",
      "Notes",
    ],
    payroll.map((p) => [
      p.employeeName,
      p.basicSalary,
      p.bonus,
      p.taxDeducted,
      p.loanInstallment,
      p.otherDeductions,
      p.netPayable,
      p.amountPaid,
      p.remaining,
      p.status,
      p.paidDate,
      p.notes,
    ]),
    [2, 3, 4, 5, 6, 7, 8, 9],
    [11]
  );

  addSheet(
    wb,
    "Commissions",
    `Commissions — ${period.label}`,
    ["Employee", "Trip Ref", "Client", "Sale Amount", "Rate %", "Commission", "Status", "Notes"],
    commissions.map((c) => [
      c.employeeName,
      c.tripRef,
      c.clientName,
      c.saleAmount,
      c.commissionRate,
      c.commissionAmt,
      c.status,
      c.notes,
    ]),
    [4, 6]
  );

  addSheet(
    wb,
    "OfficeExpenses",
    `Office Expenses — ${period.label}`,
    [
      "Date",
      "Category",
      "Description",
      "Amount",
      "Vendor",
      "Payment Method",
      "Receipt Ref",
      "Approved By",
      "Department",
      "Recurring",
      "Notes",
    ],
    office.map((o) => [
      o.date,
      o.category,
      o.description,
      o.amount,
      o.vendor,
      o.paymentMethod,
      o.receiptRef,
      o.approvedBy,
      o.department,
      o.recurring ? "Yes" : "No",
      o.notes,
    ]),
    [4],
    [1]
  );

  addSheet(
    wb,
    "Marketing",
    `Marketing Spend — ${period.label}`,
    ["Date", "Channel", "Description", "Amount", "Vendor", "Payment Method", "Receipt Ref", "Notes"],
    marketing.map((m) => [
      m.date,
      m.channel,
      m.description,
      m.amount,
      m.vendor,
      m.paymentMethod,
      m.receiptRef,
      m.notes,
    ]),
    [4],
    [1]
  );

  addSheet(
    wb,
    "PettyCash",
    `Petty Cash — ${period.label}`,
    [
      "Date",
      "Description",
      "Person",
      "Amount Out",
      "Amount In",
      "Purpose",
      "Receipt Ref",
      "Balance After",
      "Approved By",
      "Notes",
    ],
    petty.map((p) => [
      p.date,
      p.description,
      p.personReceiving,
      p.amountOut,
      p.amountIn,
      p.purpose,
      p.receiptRef,
      p.balanceAfter,
      p.approvedBy,
      p.notes,
    ]),
    [4, 5, 8],
    [1]
  );

  addSheet(
    wb,
    "BankTxn",
    `Bank Movements — ${period.label}`,
    [
      "Date",
      "Account",
      "Description",
      "Deposit",
      "Withdrawal",
      "Transfer In",
      "Transfer Out",
      "Bank Charges",
      "Balance After",
      "Statement Ref",
      "Reconciled",
      "Notes",
    ],
    bankTxns.map((t) => [
      t.date,
      t.accountName,
      t.description,
      t.deposit,
      t.withdrawal,
      t.transferIn,
      t.transferOut,
      t.bankCharges,
      t.balance,
      t.statementRef,
      t.reconciled ? "Yes" : "No",
      t.notes,
    ]),
    [4, 5, 6, 7, 8, 9],
    [1]
  );

  addSheet(
    wb,
    "Liabilities",
    `Liabilities — ${period.label}`,
    [
      "Type",
      "Party",
      "Description",
      "Original",
      "Paid",
      "Outstanding",
      "Due Date",
      "Interest",
      "Related Ref",
      "Start Date",
      "Status",
      "Notes",
    ],
    liabilities.map((l) => [
      l.liabilityType,
      l.partyName,
      l.description,
      l.originalAmount,
      l.amountPaid,
      l.outstanding,
      l.dueDate,
      l.interest,
      l.relatedRef,
      l.startDate,
      l.status,
      l.notes,
    ]),
    [4, 5, 6, 8],
    [7, 10]
  );

  addSheet(
    wb,
    "OwnerAccount",
    `Owner Account — ${period.label}`,
    [
      "Date",
      "Type",
      "Description",
      "Amount In",
      "Amount Out",
      "Running Balance",
      "Mode",
      "Recorded By",
      "Supporting Doc",
      "Notes",
    ],
    owner.map((o) => [
      o.date,
      o.type,
      o.description,
      o.amountIn,
      o.amountOut,
      o.runningBalance,
      o.mode,
      o.recordedBy,
      o.supportingDoc,
      o.notes,
    ]),
    [4, 5, 6],
    [1]
  );

  addSheet(
    wb,
    "Vadets",
    `Vadets / Staff Advances — ${period.label}`,
    ["Name", "Amount", "Notes"],
    vadets.map((v) => [v.name, v.amount, v.notes]),
    [2]
  );

  addSheet(
    wb,
    "SalesPerformance",
    `Sales Team Performance — ${period.label}`,
    [
      "Employee (Salesperson)",
      "Tour Date",
      "Description",
      "Category",
      "Sub-Category",
      "Client",
      "Debit (Sale)",
      "Credit",
      "Status",
      "Entered By",
      "Notes",
    ],
    salesPerformance.map((s) => [
      s.employeeName,
      s.tourDate,
      s.description,
      s.category,
      s.subCategory,
      s.clientName,
      s.debit,
      s.credit,
      s.status,
      s.enteredBy,
      s.notes,
    ]),
    [7, 8],
    [2]
  );

  // ── NEW: SalesAttribution — clean pivot: who closed which sale ──
  addSheet(
    wb,
    "SalesAttribution",
    `Who Closed Which Sale — ${period.label}`,
    [
      "Salesperson",
      "Client",
      "Trip / Description",
      "Tour Date",
      "Sale Amount (PKR)",
      "Receivable Status",
      "Receivable Remaining",
      "Trip Ref",
    ],
    salesPerformance
      .filter((s) => (s.debit || 0) > 0)
      .slice()
      .sort((a, b) => {
        const nameCmp = (a.employeeName || "").localeCompare(b.employeeName || "");
        if (nameCmp !== 0) return nameCmp;
        const ta = a.tourDate ? new Date(a.tourDate).getTime() : 0;
        const tb = b.tourDate ? new Date(b.tourDate).getTime() : 0;
        return ta - tb;
      })
      .map((s) => {
        const recv = receivables.find((r) => r.clientName === s.clientName);
        return [
          s.employeeName || "",
          s.clientName || "",
          s.description || "",
          s.tourDate,
          s.debit || 0,
          recv?.status ?? "",
          recv?.remainingAmount ?? 0,
          recv?.tripDates ?? "",
        ];
      }),
    [5, 7],
    [4]
  );

  addSheet(
    wb,
    "SalesTarget",
    `Sales Target — ${period.label}`,
    ["Target Amount (PKR)", "Notes", "Created At", "Updated At"],
    salesTarget
      ? [[
          salesTarget.targetAmount,
          salesTarget.notes,
          salesTarget.createdAt,
          salesTarget.updatedAt,
        ]]
      : [],
    [1],
    [3, 4]
  );

  addSheet(
    wb,
    "BalanceSheet",
    `Balance Sheet — ${period.label}`,
    ["Section", "Label", "Amount (PKR)", "Sort Order", "Notes"],
    balanceSheetLines.map((b) => [
      b.section,
      b.label,
      b.amount,
      b.sortOrder,
      b.notes,
    ]),
    [3]
  );

  addSheet(
    wb,
    "MonthlyClosing",
    `Monthly Closing — ${period.label}`,
    [
      "Total Revenue",
      "Ticketing Revenue",
      "Other Revenue",
      "Hotels Cost",
      "Transport Cost",
      "Ticketing Cost",
      "Other Direct Cost",
      "Total Direct Cost",
      "Gross Profit",
      "Salaries",
      "Commissions",
      "Marketing",
      "Office Expenses",
      "Other Overheads",
      "Total Operating Exp",
      "Net Profit",
      "Bank Balance",
      "Cash Balance",
      "Receivables",
      "Payables",
      "Supplier Advances",
      "Loans Liabilities",
      "Assets at Cost",
      "Net Working Capital",
      "Trips Completed",
      "Avg Revenue Per Trip",
      "Profit Margin %",
      "Closed At",
      "Closed By",
      "Notes",
    ],
    monthlyClosings.map((m) => [
      m.totalRevenue,
      m.ticketingRevenue,
      m.otherRevenue,
      m.hotelsCost,
      m.transportCost,
      m.ticketingCost,
      m.otherDirectCost,
      m.totalDirectCost,
      m.grossProfit,
      m.salaries,
      m.commissions,
      m.marketing,
      m.officeExpenses,
      m.otherOverheads,
      m.totalOperatingExp,
      m.netProfit,
      m.bankBalance,
      m.cashBalance,
      m.receivables,
      m.payables,
      m.supplierAdvances,
      m.loansLiabilities,
      m.assetsAtCost,
      m.netWorkingCapital,
      m.tripsCompleted,
      m.avgRevenuePerTrip,
      m.profitMarginPct,
      m.closedAt,
      m.closedBy,
      m.notes,
    ]),
    [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      21, 22, 23, 24, 26,
    ],
    [28]
  );

  addSheet(
    wb,
    "CashFlowSnapshots",
    `Cash Flow Snapshots — ${period.label}`,
    [
      "As Of",
      "Bank Balances",
      "Petty Cash",
      "Expected Collections 7d",
      "Total Available",
      "Hotel Payments Due",
      "Supplier Payments Due",
      "Driver Payments Due",
      "Salaries Due",
      "Marketing Committed",
      "Office Expenses Due",
      "Taxes Due",
      "Other Liabilities",
      "Total Committed",
      "Free Cash",
    ],
    cashFlowSnapshots.map((c) => [
      c.asOfDate,
      c.bankBalances,
      c.pettyCash,
      c.expectedCollections7d,
      c.totalAvailable,
      c.hotelPaymentsDue,
      c.supplierPaymentsDue,
      c.driverPaymentsDue,
      c.salariesDue,
      c.marketingCommitted,
      c.officeExpensesDue,
      c.taxesDue,
      c.otherLiabilities,
      c.totalCommitted,
      c.freeCash,
    ]),
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [1]
  );

  // ══════════════════════════════════════════════════════════════════
  // MASTER / GLOBAL TABLES
  // ══════════════════════════════════════════════════════════════════

  addSheet(
    wb,
    "Clients",
    `Clients Master (all) — Salesperson derived from most recent receivable`,
    ["Name", "Salesperson", "Contact", "Phone", "Email", "Notes", "Created At"],
    clients.map((c) => {
      const clientRecv = receivables
        .filter((r) => r.clientId === c.id || r.clientName === c.name)
        .slice()
        .sort((a, b) => {
          const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bt - at;
        });
      const salesperson =
        clientRecv.find((r) => r.salesperson)?.salesperson ?? "";
      return [
        c.name,
        salesperson,
        c.contact,
        c.phone,
        c.email,
        c.notes,
        c.createdAt,
      ];
    }),
    [],
    [7]
  );

  addSheet(
    wb,
    "ClientLedger",
    `Client Ledger (all) — Salesperson derived per client`,
    [
      "Client",
      "Salesperson",
      "Tour Date",
      "Description",
      "Category",
      "Sub-Category",
      "Hotel",
      "Debit",
      "Credit",
      "Status",
      "Receipt Ref",
      "Entered By",
      "Notes",
      "Created At",
    ],
    clientLedgers.map((l) => {
      const client = clients.find((c) => c.id === l.clientId);
      const clientRecv = receivables.filter(
        (r) => r.clientId === l.clientId || r.clientName === l.clientName
      );
      const salesperson =
        clientRecv.find((r) => r.salesperson)?.salesperson ?? "";
      return [
        l.clientName || client?.name || "",
        salesperson,
        l.tourDate,
        l.description,
        l.category,
        l.subCategory,
        l.hotel,
        l.debit,
        l.credit,
        l.status,
        l.receiptRef,
        l.enteredBy,
        l.notes,
        l.createdAt,
      ];
    }),
    [8, 9],
    [3, 14]
  );

  addSheet(
    wb,
    "Employees",
    `Employee Master (all)`,
    ["Name", "Role", "Basic Salary", "Phone", "Is Active", "Created At"],
    employees.map((e) => [
      e.name,
      e.role,
      e.basicSalary,
      e.phone,
      e.isActive ? "Yes" : "No",
      e.createdAt,
    ]),
    [3],
    [6]
  );

  addSheet(
    wb,
    "EmployeeLoans",
    `Employee Loans (all)`,
    [
      "Employee",
      "Original Amount",
      "Remaining",
      "Monthly Installment",
      "Start Date",
      "Notes",
      "Created At",
    ],
    employeeLoans.map((l) => {
      const emp = employees.find((e) => e.id === l.employeeId);
      return [
        emp?.name || "",
        l.originalAmount,
        l.remainingAmount,
        l.monthlyInstallment,
        l.startDate,
        l.notes,
        l.createdAt,
      ];
    }),
    [2, 3, 4],
    [5, 7]
  );

  addSheet(
    wb,
    "Assets",
    `Company Assets (all)`,
    [
      "Asset Name",
      "Category",
      "Purchase Date",
      "Cost",
      "Status",
      "Location",
      "Serial No",
      "Disposal Date",
      "Disposal Value",
      "Notes",
    ],
    assets.map((a) => [
      a.assetName,
      a.category,
      a.purchaseDate,
      a.purchaseCost,
      a.currentStatus,
      a.location,
      a.serialNo,
      a.disposalDate,
      a.disposalValue,
      a.notes,
    ]),
    [4, 9],
    [3, 8]
  );

  addSheet(
    wb,
    "BankBalances",
    `Bank Balances (current — all periods)`,
    ["Account Name", "Balance (PKR)", "As Of Date", "Updated At"],
    banks.map((b) => [b.accountName, b.balance, b.asOfDate, b.updatedAt]),
    [2],
    [3, 4]
  );

  addSheet(
    wb,
    "BankAccounts",
    `Bank Accounts Master (all)`,
    ["Name", "Type", "Is Active", "Created At"],
    bankAccounts.map((b) => [
      b.name,
      b.type,
      b.isActive ? "Yes" : "No",
      b.createdAt,
    ]),
    [],
    [4]
  );

  addSheet(
    wb,
    "Periods",
    `All Periods`,
    ["Year", "Month", "Label", "Is Closed", "Created At", "Updated At"],
    allPeriods.map((p) => [
      p.year,
      p.month,
      p.label,
      p.isClosed ? "Yes" : "No",
      p.createdAt,
      p.updatedAt,
    ]),
    [],
    [5, 6]
  );

  addSheet(
    wb,
    "CompanySettings",
    `Company Settings`,
    [
      "Company Name",
      "City",
      "Currency",
      "Fiscal Year Start",
      "Created At",
      "Updated At",
    ],
    companySettings
      ? [[
          companySettings.companyName,
          companySettings.city,
          companySettings.currency,
          companySettings.fiscalYearStart,
          companySettings.createdAt,
          companySettings.updatedAt,
        ]]
      : [],
    [],
    [5, 6]
  );

  return wb;
}

export async function buildClientDataWorkbook(periodId: string) {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Period not found");

  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const ledgers = await prisma.clientLedger.findMany({
    orderBy: { tourDate: "asc" },
  });
  const receivables = await prisma.receivable.findMany({ where: { periodId } });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pacific Trips";
  wb.title = `Client Data — ${period.label}`;

  const clientNames = new Set<string>();
  clients.forEach((c) => clientNames.add(c.name));
  receivables.forEach((r) => clientNames.add(r.clientName));

  for (const name of clientNames) {
    const client = clients.find((c) => c.name === name);
    const recv = receivables.filter((r) => r.clientName === name);
    const salesperson = recv.find((r) => r.salesperson)?.salesperson || "";
    const sheetName = name.replace(/[\\/*?[\]:]/g, "").slice(0, 31);
    const ws = wb.addWorksheet(sheetName || "Client");

    ws.mergeCells("A1:L1");
    ws.getCell("A1").value = "PACIFIC TRIPS — Clients' Ledger";
    ws.getCell("A1").font = TITLE_FONT;
    ws.getCell("A2").value = `Client: ${name}`;
    ws.getCell("C2").value = `Phone: ${client?.phone || ""}`;
    ws.getCell("E2").value = `Salesperson: ${salesperson}`;
    ws.getCell("G2").value = `Period: ${period.label}`;
    ws.getRow(2).font = { italic: true, size: 10 };

    const headerRow = ws.addRow([
      "Tour Date",
      "Description",
      "Category",
      "Sub-Category",
      "Client Name",
      "Hotel",
      "Debit (PKR)",
      "Credit (PKR)",
      "Status",
      "Receipt Ref",
      "Entered By",
      "Notes",
    ]);
    styleHeader(headerRow);

    for (const r of recv) {
      const row = ws.addRow([
        r.bookingDate,
        r.tripDates || r.destination,
        "Receivable",
        "",
        r.clientName,
        "",
        r.amountReceived,
        r.remainingAmount,
        r.status,
        "",
        "",
        r.notes,
      ]);
      row.getCell(7).numFmt = MONEY_FMT;
      row.getCell(8).numFmt = MONEY_FMT;
    }

    if (client) {
      for (const l of ledgers.filter((x) => x.clientId === client.id)) {
        const row = ws.addRow([
          l.tourDate,
          l.description,
          l.category,
          l.subCategory,
          name,
          l.hotel,
          l.debit,
          l.credit,
          l.status,
          l.receiptRef,
          l.enteredBy,
          l.notes,
        ]);
        row.getCell(7).numFmt = MONEY_FMT;
        row.getCell(8).numFmt = MONEY_FMT;
      }
    }

    const totalDebit = recv.reduce((s, r) => s + r.amountReceived, 0);
    const totalCredit = recv.reduce((s, r) => s + r.remainingAmount, 0);
    const tot = ws.addRow(["", "", "", "", "TOTALS", "", totalDebit, totalCredit]);
    tot.font = { bold: true };
    tot.getCell(7).numFmt = MONEY_FMT;
    tot.getCell(8).numFmt = MONEY_FMT;

    ws.columns.forEach((c) => {
      c.width = 14;
    });
    ws.getColumn(2).width = 28;
  }

  if (wb.worksheets.length === 0) {
    addSheet(
      wb,
      "Clients",
      "Clients Master",
      ["Name", "Phone", "Contact", "Email", "Notes"],
      clients.map((c) => [c.name, c.phone, c.contact, c.email, c.notes])
    );
  }

  return wb;
}

export async function buildSalesTeamWorkbook(periodId: string) {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Period not found");

  const employees = await prisma.employee.findMany({
    where: { role: "Sales", isActive: true },
    orderBy: { name: "asc" },
  });
  const performance = await prisma.salesPerformance.findMany({
    where: { periodId },
  });
  const commissions = await prisma.commission.findMany({ where: { periodId } });
  const payroll = await prisma.payrollEntry.findMany({ where: { periodId } });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pacific Trips";
  wb.title = `Sales Team Performance — ${period.label}`;

  addSheet(
    wb,
    "Summary",
    `Sales Team Summary — ${period.label}`,
    [
      "Employee",
      "Basic Salary",
      "Commission",
      "Net Payable",
      "Sale Base",
      "Loan Installment",
      "Status",
    ],
    payroll.map((p) => {
      const c = commissions.find((x) => x.employeeName === p.employeeName);
      return [
        p.employeeName,
        p.basicSalary,
        c?.commissionAmt || 0,
        p.netPayable,
        c?.saleAmount || 0,
        p.loanInstallment,
        p.status,
      ];
    }),
    [2, 3, 4, 5, 6]
  );

  const policy = wb.addWorksheet("Commission Policy");
  policy.getCell("A1").value = "Sales Commission Policy";
  policy.getCell("A1").font = TITLE_FONT;
  policy.getCell("A3").value =
    "Sales team members: Basic 40,000 PKR + 2.5% of their individual sales";
  policy.getCell("A4").value =
    "Team Lead (Amad / Ammar Amjad): NO basic salary; 2.5% of ALL sales team sales";
  policy.getCell("A6").value = "Monthly loan installments deducted from salary:";
  policy.getCell("A7").value = "• Ahsaan: 30,000 PKR / month";
  policy.getCell("A8").value = "• Amjad (Ahmad Amjad): 20,000 PKR / month";
  policy.getCell("A9").value = "• Awais: 20,000 PKR / month";
  policy.getColumn(1).width = 80;

  for (const emp of employees) {
    const rows = performance.filter((p) => p.employeeName === emp.name);
    const sheetName = emp.name.replace(/[\\/*?[\]:]/g, "").slice(0, 31);
    const ws = wb.addWorksheet(sheetName || "Sales");
    ws.mergeCells("A1:J1");
    ws.getCell("A1").value = "PACIFIC TRIPS — Sales Team's Ledger";
    ws.getCell("A1").font = TITLE_FONT;
    ws.getCell("A2").value = `Employee: ${emp.name} | Role: ${emp.role} | Period: ${period.label}`;

    const headerRow = ws.addRow([
      "Tour Date",
      "Description",
      "Category",
      "Sub-Category",
      "Client Name",
      "Debit (PKR)",
      "Credit (PKR)",
      "Status",
      "Entered By",
      "Notes",
    ]);
    styleHeader(headerRow);

    for (const r of rows) {
      const row = ws.addRow([
        r.tourDate,
        r.description,
        r.category,
        r.subCategory,
        r.clientName,
        r.debit,
        r.credit,
        r.status,
        r.enteredBy,
        r.notes,
      ]);
      row.getCell(6).numFmt = MONEY_FMT;
      row.getCell(7).numFmt = MONEY_FMT;
    }

    const comm = commissions.find((c) => c.employeeName === emp.name);
    if (comm) {
      ws.addRow([]);
      const cr = ws.addRow([
        "Commission",
        `Sale base: ${comm.saleAmount}`,
        `Rate: ${comm.commissionRate}%`,
        `Amount: ${comm.commissionAmt}`,
        comm.status,
      ]);
      cr.font = { bold: true };
    }

    ws.columns.forEach((c) => {
      c.width = 14;
    });
  }

  return wb;
}