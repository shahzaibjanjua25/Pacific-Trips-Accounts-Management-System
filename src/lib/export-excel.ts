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
const TITLE_FONT: Partial<ExcelJS.Font> = { bold: true, size: 14, color: { argb: "FF1E3A5F" } };
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

  // Title row
  ws.mergeCells(1, 1, 1, Math.max(headers.length, 1));
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = TITLE_FONT;
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(1).height = 28;

  // Header row
  const headerRow = ws.addRow(headers);
  styleHeader(headerRow);

  // Data
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

  // Column widths
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(Math.max(h.length + 2, 12), 28);
  });

  // Auto-filter
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
    txns, receivables, trips, payables, hotels, transport, ticketing,
    advances, refunds, payroll, commissions, office, marketing,
    petty, banks, assets, liabilities, owner, vadets,
  ] = await Promise.all([
    prisma.transaction.findMany({ where: { periodId }, orderBy: { date: "asc" } }),
    prisma.receivable.findMany({ where: { periodId } }),
    prisma.trip.findMany({ where: { periodId } }),
    prisma.payable.findMany({ where: { periodId } }),
    prisma.hotelBooking.findMany({ where: { periodId } }),
    prisma.transportJob.findMany({ where: { periodId } }),
    prisma.ticketing.findMany({ where: { periodId } }),
    prisma.supplierAdvance.findMany({ where: { periodId } }),
    prisma.refund.findMany({ where: { periodId } }),
    prisma.payrollEntry.findMany({ where: { periodId } }),
    prisma.commission.findMany({ where: { periodId } }),
    prisma.officeExpense.findMany({ where: { periodId } }),
    prisma.marketingExpense.findMany({ where: { periodId } }),
    prisma.pettyCashTxn.findMany({ where: { periodId } }),
    prisma.bankBalance.findMany(),
    prisma.asset.findMany(),
    prisma.liability.findMany({ where: { periodId } }),
    prisma.ownerTxn.findMany({ where: { periodId } }),
    prisma.vadet.findMany({ where: { periodId } }),
  ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pacific Trips Accounting System";
  wb.created = new Date();
  wb.title = `Pacific Trips — ${period.label}`;

  // Cover / Instructions
  const cover = wb.addWorksheet("Instructions");
  cover.getCell("A1").value = "PACIFIC TRIPS — COMPLETE ACCOUNTING SYSTEM";
  cover.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF1E3A5F" } };
  cover.getCell("A2").value = `Period: ${period.label} | Lahore, Pakistan | All figures in PKR | Confidential`;
  cover.getCell("A4").value = "Exported from Pacific Trips web system. Sheets mirror the Excel workbook modules.";
  cover.getCell("A6").value = "HOW TO USE";
  cover.getCell("A6").font = { bold: true };
  cover.getCell("A7").value = "1. Each sheet is one module (Transactions, Receivables, TripPnL, …).";
  cover.getCell("A8").value = "2. Green header row = column titles. Numbers formatted as PKR.";
  cover.getCell("A9").value = "3. Filters enabled on data sheets. Frozen header rows.";
  cover.getCell("A10").value = "4. Dashboard figures in the app are live formulas from these source tables.";
  cover.getColumn(1).width = 90;

  addSheet(wb, "Transactions", `Daily Transactions / General Ledger — ${period.label}`, [
    "Date","Txn ID","Description","Category","Sub-Category","Client/Vendor","Trip Ref",
    "Debit (PKR)","Credit (PKR)","Payment Method","Bank/Cash Account","Status","Entered By","Notes",
  ], txns.map((t) => [
    t.date, t.txnId, t.description, t.category, t.subCategory, t.party, t.tripRef,
    t.debit, t.credit, t.paymentMethod, t.bankAccount, t.status, t.enteredBy, t.notes,
  ]), [8, 9], [1]);

  addSheet(wb, "Receivables", `Client Receivables — ${period.label}`, [
    "Client Name","Contact","Booking Date","Trip Dates","Destination","Total Package",
    "Amount to Receive","Amount Received","Remaining","Due Date","Days Overdue","Salesperson","Status","Notes",
  ], receivables.map((r) => [
    r.clientName, r.contact, r.bookingDate, r.tripDates, r.destination, r.totalPackage,
    r.amountToReceive, r.amountReceived, r.remainingAmount, r.dueDate, r.daysOverdue,
    r.salesperson, r.status, r.notes,
  ]), [6, 7, 8, 9], [3, 10]);

  addSheet(wb, "TripPnL", `Trip Profit & Loss — ${period.label}`, [
    "Client","Trip Ref","Destination","Start","End","Package Revenue","Hotel Cost",
    "Transport Cost","Ticketing Cost","Other Direct","Total Direct","Gross Profit","Net Profit","Salesperson","Status",
  ], trips.map((t) => [
    t.clientName, t.tripRef, t.destination, t.startDate, t.endDate, t.packageRevenue,
    t.hotelCost, t.transportCost, t.ticketingCost, t.otherDirectCost, t.totalDirectCost,
    t.grossProfit, t.netProfit, t.salesperson, t.status,
  ]), [6, 7, 8, 9, 10, 11, 12, 13], [4, 5]);

  addSheet(wb, "Payables", `Supplier Payables — ${period.label}`, [
    "Supplier","Category","Description","Invoice Ref","Original Amount","Amount Paid","Remaining","Due Date","Status","Trip Ref","Notes",
  ], payables.map((p) => [
    p.supplierName, p.category, p.description, p.invoiceRef, p.originalAmount, p.amountPaid,
    p.remaining, p.dueDate, p.status, p.relatedTrip, p.notes,
  ]), [5, 6, 7], [8]);

  addSheet(wb, "Hotels", `Hotels — ${period.label}`, [
    "Hotel","Client","Trip Ref","Check In","Check Out","Nights","Rooms","Agreed Cost","Paid","Remaining","Status","Notes",
  ], hotels.map((h) => [
    h.hotelName, h.clientName, h.tripRef, h.checkIn, h.checkOut, h.nights, h.rooms,
    h.agreedCost, h.amountPaid, h.remaining, h.status, h.notes,
  ]), [8, 9, 10], [4, 5]);

  addSheet(wb, "Transport", `Transport — ${period.label}`, [
    "Driver","Vehicle","Client","Trip Ref","Agreed Cost","Fuel Cost","Final Settlement","Remaining","Status","Notes",
  ], transport.map((t) => [
    t.driverName, t.vehicle, t.clientName, t.tripRef, t.agreedCost, t.fuelCost,
    t.finalSettlement, t.remaining, t.status, t.notes,
  ]), [5, 6, 7, 8]);

  addSheet(wb, "Ticketing", `Ticketing — ${period.label}`, [
    "Airline","Client","Trip Ref","Ticket Cost","Charged to Client","Profit","Status","Notes",
  ], ticketing.map((t) => [
    t.airline, t.clientName, t.tripRef, t.ticketCost, t.chargedToClient, t.profit, t.status, t.notes,
  ]), [4, 5, 6]);

  addSheet(wb, "SupplierAdvances", `Supplier Advances — ${period.label}`, [
    "Supplier","Amount","Adjusted","Remaining","Trip Ref","Date Given","Notes",
  ], advances.map((a) => [
    a.supplierName, a.amount, a.adjustedAmount, a.remaining, a.relatedTrip, a.dateGiven, a.notes,
  ]), [2, 3, 4], [6]);

  addSheet(wb, "Refunds", `Refunds — ${period.label}`, [
    "Client","Amount","Reason","Status","Paid Date","Trip Ref","Notes",
  ], refunds.map((r) => [
    r.clientName, r.amount, r.reason, r.status, r.paidDate, r.tripRef, r.notes,
  ]), [2], [5]);

  addSheet(wb, "Payroll", `Payroll — ${period.label}`, [
    "Employee","Basic Salary","Tax Deducted","Loan Installment","Other Deductions","Net Payable","Status","Notes",
  ], payroll.map((p) => [
    p.employeeName, p.basicSalary, p.taxDeducted, p.loanInstallment, p.otherDeductions,
    p.netPayable, p.status, p.notes,
  ]), [2, 3, 4, 5, 6]);

  addSheet(wb, "Commissions", `Commissions — ${period.label}`, [
    "Employee","Trip Ref","Client","Sale Amount","Rate %","Commission","Status",
  ], commissions.map((c) => [
    c.employeeName, c.tripRef, c.clientName, c.saleAmount, c.commissionRate, c.commissionAmt, c.status,
  ]), [4, 6]);

  addSheet(wb, "OfficeExpenses", `Office Expenses — ${period.label}`, [
    "Date","Category","Description","Amount","Vendor","Payment Method","Receipt Ref","Approved By","Notes",
  ], office.map((o) => [
    o.date, o.category, o.description, o.amount, o.vendor, o.paymentMethod, o.receiptRef, o.approvedBy, o.notes,
  ]), [4], [1]);

  addSheet(wb, "Marketing", `Marketing Spend — ${period.label}`, [
    "Date","Channel","Description","Amount","Vendor","Payment Method","Notes",
  ], marketing.map((m) => [
    m.date, m.channel, m.description, m.amount, m.vendor, m.paymentMethod, m.notes,
  ]), [4], [1]);

  addSheet(wb, "PettyCash", `Petty Cash — ${period.label}`, [
    "Date","Description","Person","Amount Out","Amount In","Purpose","Balance After","Approved By","Notes",
  ], petty.map((p) => [
    p.date, p.description, p.personReceiving, p.amountOut, p.amountIn, p.purpose, p.balanceAfter, p.approvedBy, p.notes,
  ]), [4, 5, 7], [1]);

  addSheet(wb, "Bank", `Bank Balances — ${period.label}`, [
    "Account Name","Balance (PKR)",
  ], banks.map((b) => [b.accountName, b.balance]), [2]);

  addSheet(wb, "Assets", `Company Assets`, [
    "Asset Name","Category","Purchase Date","Cost","Status","Location","Serial","Notes",
  ], assets.map((a) => [
    a.assetName, a.category, a.purchaseDate, a.purchaseCost, a.currentStatus, a.location, a.serialNo, a.notes,
  ]), [4], [3]);

  addSheet(wb, "Liabilities", `Liabilities — ${period.label}`, [
    "Type","Party","Description","Original","Paid","Outstanding","Due Date","Status","Notes",
  ], liabilities.map((l) => [
    l.liabilityType, l.partyName, l.description, l.originalAmount, l.amountPaid, l.outstanding, l.dueDate, l.status, l.notes,
  ]), [4, 5, 6], [7]);

  addSheet(wb, "OwnerAccount", `Owner Account — ${period.label}`, [
    "Date","Type","Description","Amount In","Amount Out","Mode","Notes",
  ], owner.map((o) => [
    o.date, o.type, o.description, o.amountIn, o.amountOut, o.mode, o.notes,
  ]), [4, 5], [1]);

  addSheet(wb, "Vadets", `Vadets / Staff Advances — ${period.label}`, [
    "Name","Amount","Notes",
  ], vadets.map((v) => [v.name, v.amount, v.notes]), [2]);

  return wb;
}

export async function buildClientDataWorkbook(periodId: string) {
  const period = await prisma.period.findUnique({ where: { id: periodId } });
  if (!period) throw new Error("Period not found");

  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const ledgers = await prisma.clientLedger.findMany({ orderBy: { tourDate: "asc" } });
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
    const sheetName = name.replace(/[\\/*?[\]:]/g, "").slice(0, 31);
    const ws = wb.addWorksheet(sheetName || "Client");

    ws.mergeCells("A1:L1");
    ws.getCell("A1").value = "PACIFIC TRIPS — Clients' Ledger";
    ws.getCell("A1").font = TITLE_FONT;
    ws.getCell("A2").value = `Client: ${name}`;
    ws.getCell("C2").value = `Phone: ${client?.phone || ""}`;
    ws.getCell("E2").value = `Period: ${period.label}`;
    ws.getRow(2).font = { italic: true, size: 10 };

    const headerRow = ws.addRow([
      "Tour Date","Description","Category","Sub-Category","Client Name","Hotel",
      "Debit (PKR)","Credit (PKR)","Status","Receipt Ref","Entered By","Notes",
    ]);
    styleHeader(headerRow);

    for (const r of recv) {
      const row = ws.addRow([
        r.bookingDate, r.tripDates || r.destination, "Receivable", "", r.clientName, "",
        r.amountReceived, r.remainingAmount, r.status, "", "", r.notes,
      ]);
      row.getCell(7).numFmt = MONEY_FMT;
      row.getCell(8).numFmt = MONEY_FMT;
    }

    if (client) {
      for (const l of ledgers.filter((x) => x.clientId === client.id)) {
        const row = ws.addRow([
          l.tourDate, l.description, l.category, l.subCategory, name, l.hotel,
          l.debit, l.credit, l.status, l.receiptRef, l.enteredBy, l.notes,
        ]);
        row.getCell(7).numFmt = MONEY_FMT;
        row.getCell(8).numFmt = MONEY_FMT;
      }
    }

    // Totals
    const totalDebit = recv.reduce((s, r) => s + r.amountReceived, 0);
    const totalCredit = recv.reduce((s, r) => s + r.remainingAmount, 0);
    const tot = ws.addRow(["", "", "", "", "TOTALS", "", totalDebit, totalCredit]);
    tot.font = { bold: true };
    tot.getCell(7).numFmt = MONEY_FMT;
    tot.getCell(8).numFmt = MONEY_FMT;

    ws.columns.forEach((c) => { c.width = 14; });
    ws.getColumn(2).width = 28;
  }

  if (wb.worksheets.length === 0) {
    addSheet(wb, "Clients", "Clients Master", ["Name","Phone","Contact","Email","Notes"],
      clients.map((c) => [c.name, c.phone, c.contact, c.email, c.notes]));
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
  const performance = await prisma.salesPerformance.findMany({ where: { periodId } });
  const commissions = await prisma.commission.findMany({ where: { periodId } });
  const payroll = await prisma.payrollEntry.findMany({ where: { periodId } });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Pacific Trips";
  wb.title = `Sales Team Performance — ${period.label}`;

  addSheet(wb, "Summary", `Sales Team Summary — ${period.label}`, [
    "Employee","Basic Salary","Commission","Net Payable","Sale Base","Loan Installment","Status",
  ], payroll.map((p) => {
    const c = commissions.find((x) => x.employeeName === p.employeeName);
    return [
      p.employeeName, p.basicSalary, c?.commissionAmt || 0, p.netPayable,
      c?.saleAmount || 0, p.loanInstallment, p.status,
    ];
  }), [2, 3, 4, 5, 6]);

  // Policy note
  const policy = wb.addWorksheet("Commission Policy");
  policy.getCell("A1").value = "Sales Commission Policy";
  policy.getCell("A1").font = TITLE_FONT;
  policy.getCell("A3").value = "Sales team members: Basic 40,000 PKR + 2.5% of their individual sales";
  policy.getCell("A4").value = "Team Lead (Amad / Ammar Amjad): NO basic salary; 2.5% of ALL sales team sales";
  policy.getCell("A6").value = "Monthly loan installments deducted from salary:";
  policy.getCell("A7").value = "• Ahsaan: 30,000 PKR / month";
  policy.getCell("A8").value = "• Amjad (Amad Amjad): 20,000 PKR / month";
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
      "Tour Date","Description","Category","Sub-Category","Client Name",
      "Debit (PKR)","Credit (PKR)","Status","Entered By","Notes",
    ]);
    styleHeader(headerRow);

    for (const r of rows) {
      const row = ws.addRow([
        r.tourDate, r.description, r.category, r.subCategory, r.clientName,
        r.debit, r.credit, r.status, r.enteredBy, r.notes,
      ]);
      row.getCell(6).numFmt = MONEY_FMT;
      row.getCell(7).numFmt = MONEY_FMT;
    }

    const comm = commissions.find((c) => c.employeeName === emp.name);
    if (comm) {
      ws.addRow([]);
      const cr = ws.addRow(["Commission", `Sale base: ${comm.saleAmount}`, `Rate: ${comm.commissionRate}%`, `Amount: ${comm.commissionAmt}`, comm.status]);
      cr.font = { bold: true };
    }

    ws.columns.forEach((c) => { c.width = 14; });
  }

  return wb;
}
