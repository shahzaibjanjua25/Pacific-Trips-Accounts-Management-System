import ExcelJS from "exceljs";
import { prisma } from "./prisma";

function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: unknown[][]) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow(headers);
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((col) => {
    col.width = 16;
  });
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
  wb.creator = "Pacific Trips Accounting";
  wb.created = new Date();

  addSheet(wb, "Transactions", [
    "Date","Txn ID","Description","Category","Sub-Category","Client/Vendor","Trip Ref",
    "Debit","Credit","Payment Method","Bank/Cash Account","Status","Entered By","Notes",
  ], txns.map((t) => [
    t.date, t.txnId, t.description, t.category, t.subCategory, t.party, t.tripRef,
    t.debit, t.credit, t.paymentMethod, t.bankAccount, t.status, t.enteredBy, t.notes,
  ]));

  addSheet(wb, "Receivables", [
    "Client Name","Contact","Booking Date","Trip Dates","Destination","Total Package",
    "Amount Received","Remaining","Due Date","Days Overdue","Salesperson","Status","Notes",
  ], receivables.map((r) => [
    r.clientName, r.contact, r.bookingDate, r.tripDates, r.destination, r.totalPackage,
    r.amountReceived, r.remainingAmount, r.dueDate, r.daysOverdue, r.salesperson, r.status, r.notes,
  ]));

  addSheet(wb, "TripPnL", [
    "Client","Trip Ref","Destination","Start","End","Package Revenue","Hotel Cost",
    "Transport Cost","Ticketing Cost","Other Direct","Total Direct","Gross Profit","Net Profit","Salesperson","Status",
  ], trips.map((t) => [
    t.clientName, t.tripRef, t.destination, t.startDate, t.endDate, t.packageRevenue,
    t.hotelCost, t.transportCost, t.ticketingCost, t.otherDirectCost, t.totalDirectCost,
    t.grossProfit, t.netProfit, t.salesperson, t.status,
  ]));

  addSheet(wb, "Payables", [
    "Supplier","Category","Description","Invoice Ref","Original","Paid","Remaining","Due Date","Status","Trip Ref",
  ], payables.map((p) => [
    p.supplierName, p.category, p.description, p.invoiceRef, p.originalAmount, p.amountPaid,
    p.remaining, p.dueDate, p.status, p.relatedTrip,
  ]));

  addSheet(wb, "Hotels", [
    "Hotel","Client","Trip Ref","Check In","Check Out","Nights","Rooms","Agreed Cost","Paid","Remaining","Status",
  ], hotels.map((h) => [
    h.hotelName, h.clientName, h.tripRef, h.checkIn, h.checkOut, h.nights, h.rooms,
    h.agreedCost, h.amountPaid, h.remaining, h.status,
  ]));

  addSheet(wb, "Transport", [
    "Driver","Vehicle","Client","Trip Ref","Agreed Cost","Fuel","Final Settlement","Remaining","Status",
  ], transport.map((t) => [
    t.driverName, t.vehicle, t.clientName, t.tripRef, t.agreedCost, t.fuelCost,
    t.finalSettlement, t.remaining, t.status,
  ]));

  addSheet(wb, "Ticketing", [
    "Airline","Client","Trip Ref","Ticket Cost","Charged to Client","Profit","Status",
  ], ticketing.map((t) => [
    t.airline, t.clientName, t.tripRef, t.ticketCost, t.chargedToClient, t.profit, t.status,
  ]));

  addSheet(wb, "SupplierAdvances", [
    "Supplier","Amount","Adjusted","Remaining","Trip Ref","Date Given","Notes",
  ], advances.map((a) => [
    a.supplierName, a.amount, a.adjustedAmount, a.remaining, a.relatedTrip, a.dateGiven, a.notes,
  ]));

  addSheet(wb, "Refunds", [
    "Client","Amount","Reason","Status","Paid Date","Trip Ref","Notes",
  ], refunds.map((r) => [
    r.clientName, r.amount, r.reason, r.status, r.paidDate, r.tripRef, r.notes,
  ]));

  addSheet(wb, "Payroll", [
    "Employee","Basic Salary","Tax","Loan Installment","Other Deductions","Net Payable","Status","Notes",
  ], payroll.map((p) => [
    p.employeeName, p.basicSalary, p.taxDeducted, p.loanInstallment, p.otherDeductions,
    p.netPayable, p.status, p.notes,
  ]));

  addSheet(wb, "Commissions", [
    "Employee","Trip Ref","Client","Sale Amount","Rate %","Commission","Status",
  ], commissions.map((c) => [
    c.employeeName, c.tripRef, c.clientName, c.saleAmount, c.commissionRate, c.commissionAmt, c.status,
  ]));

  addSheet(wb, "OfficeExpenses", [
    "Date","Category","Description","Amount","Vendor","Payment Method","Receipt Ref","Notes",
  ], office.map((o) => [
    o.date, o.category, o.description, o.amount, o.vendor, o.paymentMethod, o.receiptRef, o.notes,
  ]));

  addSheet(wb, "Marketing", [
    "Date","Channel","Description","Amount","Vendor","Payment Method","Notes",
  ], marketing.map((m) => [
    m.date, m.channel, m.description, m.amount, m.vendor, m.paymentMethod, m.notes,
  ]));

  addSheet(wb, "PettyCash", [
    "Date","Description","Person","Out","In","Purpose","Balance After","Approved By",
  ], petty.map((p) => [
    p.date, p.description, p.personReceiving, p.amountOut, p.amountIn, p.purpose, p.balanceAfter, p.approvedBy,
  ]));

  addSheet(wb, "Bank", [
    "Account Name","Balance",
  ], banks.map((b) => [b.accountName, b.balance]));

  addSheet(wb, "Assets", [
    "Asset Name","Category","Purchase Date","Cost","Status","Location","Serial","Notes",
  ], assets.map((a) => [
    a.assetName, a.category, a.purchaseDate, a.purchaseCost, a.currentStatus, a.location, a.serialNo, a.notes,
  ]));

  addSheet(wb, "Liabilities", [
    "Type","Party","Description","Original","Paid","Outstanding","Due Date","Status",
  ], liabilities.map((l) => [
    l.liabilityType, l.partyName, l.description, l.originalAmount, l.amountPaid, l.outstanding, l.dueDate, l.status,
  ]));

  addSheet(wb, "OwnerAccount", [
    "Date","Type","Description","Amount In","Amount Out","Mode","Notes",
  ], owner.map((o) => [
    o.date, o.type, o.description, o.amountIn, o.amountOut, o.mode, o.notes,
  ]));

  addSheet(wb, "Vadets", [
    "Name","Amount","Notes",
  ], vadets.map((v) => [v.name, v.amount, v.notes]));

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

  // One sheet per client with ledger + summary from receivables
  const clientNames = new Set<string>();
  clients.forEach((c) => clientNames.add(c.name));
  receivables.forEach((r) => clientNames.add(r.clientName));
  ledgers.forEach((l) => {
    // need client name from relation - we only have clientId; use receivables/clients
  });

  for (const name of clientNames) {
    const client = clients.find((c) => c.name === name);
    const recv = receivables.filter((r) => r.clientName === name);
    const sheetName = name.slice(0, 31);
    const ws = wb.addWorksheet(sheetName);
    ws.addRow(["PACIFIC TRIPS — Clients' Ledger"]);
    ws.addRow(["Client:", name, "Phone:", client?.phone || ""]);
    ws.addRow([]);
    ws.addRow([
      "Tour Date","Description","Category","Sub-Category","Client Name","Hotel",
      "Debit (PKR)","Credit (PKR)","Status","Receipt Ref","Entered By","Notes",
    ]);
    ws.getRow(4).font = { bold: true };

    // From receivables as summary rows
    for (const r of recv) {
      ws.addRow([
        r.bookingDate, r.tripDates || r.destination, "", "", r.clientName, "",
        r.amountReceived, r.remainingAmount, r.status, "", "", r.notes,
      ]);
    }

    // Client ledger rows if any for this client
    if (client) {
      const rows = ledgers.filter((l) => l.clientId === client.id);
      for (const l of rows) {
        ws.addRow([
          l.tourDate, l.description, l.category, l.subCategory, name, l.hotel,
          l.debit, l.credit, l.status, l.receiptRef, l.enteredBy, l.notes,
        ]);
      }
    }
  }

  if (wb.worksheets.length === 0) {
    addSheet(wb, "Clients", ["Name","Phone","Contact","Email","Notes"], 
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

  // Summary sheet
  addSheet(wb, "Summary", [
    "Employee","Basic Salary","Commission","Net Payable","Sale Base","Status",
  ], payroll.map((p) => {
    const c = commissions.find((x) => x.employeeName === p.employeeName);
    return [p.employeeName, p.basicSalary, c?.commissionAmt || 0, p.netPayable, c?.saleAmount || 0, p.status];
  }));

  // One sheet per sales person
  for (const emp of employees) {
    const rows = performance.filter((p) => p.employeeName === emp.name);
    const ws = wb.addWorksheet(emp.name.slice(0, 31));
    ws.addRow(["PACIFIC TRIPS — Sales Team's Ledger"]);
    ws.addRow(["Employee:", emp.name, "Role:", emp.role]);
    ws.addRow([]);
    ws.addRow([
      "Tour Date","Description","Category","Sub-Category","Client Name",
      "Debit (PKR)","Credit (PKR)","Status","Entered By","Notes",
    ]);
    ws.getRow(4).font = { bold: true };
    for (const r of rows) {
      ws.addRow([
        r.tourDate, r.description, r.category, r.subCategory, r.clientName,
        r.debit, r.credit, r.status, r.enteredBy, r.notes,
      ]);
    }
    const comm = commissions.find((c) => c.employeeName === emp.name);
    if (comm) {
      ws.addRow([]);
      ws.addRow(["Commission", comm.saleAmount, `${comm.commissionRate}%`, comm.commissionAmt, comm.status]);
    }
  }

  return wb;
}
