/**
 * Seed Oct-2026 — reconciled from:
 *  - Client_Data_Oct-2026.xlsx
 *  - Pacific_Trips_Complete_Accounting_System_Oct-2026.xlsx
 *  - Sales_Team_Performance_Oct-2026.xlsx
 *  - Pacific Trips Lahore — Sales & Booking Accounts.xlsx (Form responses, latest)
 *  - FBL Account Statement (Sep 19 – Oct 18, 2026)
 *
 * Additions (this revision):
 *  - Client phone numbers
 *  - +150,000 to Shahid (Transport)  → remaining now 847,000 (orig bumped to 1,597,000)
 *  - +7,000 Personal Expenses (Bank Transfer)
 *  - +25,480 added to Mr & Mrs Tahir (owed)
 *  - +16,800 to Grace Hotel, booking fully paid for Ms Saira
 *  - Current bank balances: Faysal 27,070 / Jazzcash 651 / Easypaisa 282 / UBL 0
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  if (process.env.NODE_ENV === "production" && !force) {
    console.error("❌ Refusing to seed in production without --force.");
    process.exit(1);
  }

  // ── Wipe (atomic, FK-safe, order-independent) ────────────────────────
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "TransactionLink", "ClientLedger", "SalesPerformance", "Vadet",
      "OwnerTxn", "Liability", "Asset", "BankTxn", "BankBalance",
      "PettyCashTxn", "MarketingExpense", "OfficeExpense", "Commission",
      "PayrollEntry", "EmployeeLoan", "Refund", "SupplierAdvance",
      "Ticketing", "TransportJob", "HotelBooking", "Payable", "Trip",
      "Receivable", "Transaction", "SalesTarget", "BalanceSheetLine",
      "MonthlyClosing", "CashFlowSnapshot", "BankAccount",
      "Client", "Employee", "Period"
    RESTART IDENTITY CASCADE
  `);

  const period = await prisma.period.upsert({
    where: { year_month: { year: 2026, month: 10 } },
    update: { label: "Oct-2026" },
    create: { year: 2026, month: 10, label: "Oct-2026" },
  });
  console.log("Period:", period.label);

  // ── Employees ──────────────────────────────────────────────────────
  const empData = [
    { name: "Mr Ahsaan", role: "Sales", basicSalary: 40000 },
    { name: "Ahmad Amjad", role: "Sales", basicSalary: 0 },
    { name: "Maira", role: "Sales", basicSalary: 40000 },
    { name: "Zunaira", role: "Sales", basicSalary: 40000 },
    { name: "Awais", role: "Sales", basicSalary: 40000 },
    { name: "Malika", role: "Sales", basicSalary: 40000 },
    { name: "Talha", role: "Sales", basicSalary: 40000 },
    { name: "Naimal", role: "Sales", basicSalary: 40000 },
    { name: "Ashir", role: "Sales", basicSalary: 40000 },
    { name: "Izza", role: "Sales", basicSalary: 40000 },
    { name: "Ahmed", role: "Graphic Designer", basicSalary: 50000 },
    { name: "Faysal", role: "Meta Marketing", basicSalary: 50000 },
    { name: "Abdullah", role: "CEO", basicSalary: 60000 },
    { name: "Kamran", role: "Accountant", basicSalary: 30000 },
    { name: "WAseem Akram", role: "Legal Team", basicSalary: 40000 },
    { name: "Nadeem", role: "Office Boy", basicSalary: 10000 },
  ];
  const employees: Record<string, string> = {};
  for (const e of empData) {
    const row = await prisma.employee.create({ data: e });
    employees[e.name] = row.id;
  }

  // ── Loans ──────────────────────────────────────────────────────────
  const loans = [
    { name: "Mr Ahsaan", original: 631000, remaining: 601000, installment: 30000 },
    { name: "Ahmad Amjad", original: 200000, remaining: 180000, installment: 20000 },
    { name: "Awais", original: 110000, remaining: 90000, installment: 20000 },
  ];
  for (const l of loans) {
    const eid = employees[l.name];
    if (!eid) continue;
    await prisma.employeeLoan.create({
      data: {
        employeeId: eid,
        originalAmount: l.original,
        remainingAmount: l.remaining,
        monthlyInstallment: l.installment,
        notes: `Monthly installment ${l.installment}`,
      },
    });
  }

  // ── Payroll (Oct) ──────────────────────────────────────────────────
  const payroll = [
    { name: "Mr Ahsaan", basic: 40000, bonus: 0, loan: 30000, net: 10000 },
    { name: "Ahmad Amjad", basic: 0, bonus: 0, loan: 20000, net: 35000 },
    { name: "Maira", basic: 40000, bonus: 0, loan: 0, net: 63700 },
    { name: "Zunaira", basic: 40000, bonus: 0, loan: 0, net: 50950 },
    { name: "Awais", basic: 40000, bonus: 0, loan: 20000, net: 20000 },
    { name: "Malika", basic: 40000, bonus: 0, loan: 0, net: 56850 },
    { name: "Talha", basic: 40000, bonus: 0, loan: 0, net: 50500 },
    { name: "Naimal", basic: 40000, bonus: 0, loan: 0, net: 50350 },
    { name: "Ashir", basic: 40000, bonus: 0, loan: 0, net: 53775 },
    { name: "Izza", basic: 40000, bonus: 0, loan: 0, net: 56250 },
    { name: "Ahmed", basic: 50000, bonus: 13000, loan: 0, net: 63000 },
    { name: "Faysal", basic: 50000, bonus: 0, loan: 0, net: 50000 },
    { name: "Abdullah", basic: 60000, bonus: 0, loan: 0, net: 60000 },
    { name: "Kamran", basic: 30000, bonus: 0, loan: 0, net: 30000 },
    { name: "WAseem Akram", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Nadeem", basic: 10000, bonus: 0, loan: 0, net: 10000 },
  ];
  for (const p of payroll) {
    await prisma.payrollEntry.create({
      data: {
        periodId: period.id,
        employeeId: employees[p.name],
        employeeName: p.name,
        basicSalary: p.basic,
        bonus: p.bonus,
        loanInstallment: p.loan,
        netPayable: p.net,
        remaining: p.net,
        status: "Pending",
      },
    });
  }
  await prisma.payrollEntry.updateMany({
    where: { periodId: period.id, employeeName: "Ahmed" },
    data: { otherDeductions: -13000 },
  });

  // ── Bank Balances — current state you provided ─────────────────────
  // These are the CURRENT balances; do not recompute from transactions.
  const banks = [
    { accountName: "UBL", balance: 0 },
    { accountName: "Meezan Bank", balance: 0 },
    { accountName: "Easypaisa", balance: 282 },
    { accountName: "Jazzcash", balance: 651 },
    { accountName: "Faysal Bank", balance: 27070 },
    { accountName: "Cash", balance: 0 },
  ];
  for (const b of banks) await prisma.bankBalance.create({ data: b });

  // ── Payables — Hotels + Transport ────────────────────────────────
  // NOTE: Shahid's originalAmount was raised to 1,597,000 so that with
  // 750,000 paid the remaining is exactly 847,000 (150k extra payment
  // from prior 479,000 → 847,000 target kept by raising original).
  const payablesData = [
    // Hotels
    { supplierName: "Shangrila", category: "Hotel", orig: 56700, paid: 56700, tripRef: "Mr Shahid" },
    { supplierName: "Khoj", category: "Hotel", orig: 140090, paid: 140090 },
    { supplierName: "R & S Management Company", category: "Hotel", orig: 80000, paid: 80000 },
    { supplierName: "Hatopi Resort", category: "Hotel", orig: 924000, paid: 300000 },
    { supplierName: "Alnoor", category: "Hotel", orig: 700000, paid: 300000 },
    { supplierName: "Qayyam Hunza", category: "Hotel", orig: 219000, paid: 150000 },
    { supplierName: "Himmel", category: "Hotel", orig: 490000, paid: 250000 },
    { supplierName: "Qayyam Skardu", category: "Hotel", orig: 403000, paid: 250000 },
    { supplierName: "Rivaaj", category: "Hotel", orig: 314670, paid: 150000 },
    { supplierName: "Kisar Baltistan", category: "Hotel", orig: 461900, paid: 400000 },
    // Grace Hotel — Ms Saira, fully paid
    { supplierName: "Grace Hotel", category: "Hotel", orig: 16800, paid: 16800, tripRef: "Ms Saira" },
    // Transport
    { supplierName: "Shahid", category: "Transport", orig: 1597000, paid: 750000 },
    { supplierName: "Asad", category: "Transport", orig: 441790, paid: 350000 },
  ];
  for (const p of payablesData) {
    const remaining = Math.max(0, p.orig - p.paid);
    const payable = await prisma.payable.create({
      data: {
        periodId: period.id,
        supplierName: p.supplierName,
        category: p.category,
        originalAmount: p.orig,
        amountPaid: p.paid,
        remaining,
        status: remaining <= 0 ? "Paid" : p.paid > 0 ? "Partial" : "Open",
        relatedTrip: p.tripRef ?? null,
        notes: "Seeded from Oct-2026 export",
      },
    });
    if (p.category === "Hotel") {
      await prisma.hotelBooking.create({
        data: {
          periodId: period.id,
          hotelName: p.supplierName,
          tripRef: p.tripRef ?? null,
          status: remaining <= 0 ? "Paid" : p.paid > 0 ? "Partial" : "Booked",
          payableId: payable.id,
        },
      });
    } else {
      await prisma.transportJob.create({
        data: {
          periodId: period.id,
          driverName: p.supplierName,
          status: remaining <= 0 ? "Settled" : p.paid > 0 ? "Partial" : "Pending",
          payableId: payable.id,
        },
      });
    }
  }

  // ── Clients + Receivables + Ledger ────────────────────────────────
  // Phones included. Mr & Mrs Tahir's package raised to 250,480 (+25,480).
  type ClientRow = {
    name: string;
    phone: string | null;
    tourDate: Date | null;
    desc: string;
    totalPackage: number;
    paid: number;
    salesperson: string;
    destination: string;
    costs?: { hotel: string; credit: number; notes?: string }[];
  };

  const clients: ClientRow[] = [
    {
      name: "Mr Haris", phone: "03150104572",
      tourDate: new Date("2026-10-05"),
      desc: "5 days, Skardu By Air", totalPackage: 169000, paid: 169000,
      salesperson: "Naimal", destination: "Skardu",
      costs: [
        { hotel: "Qayyam (2x nights)", credit: 34650 },
        { hotel: "Khoj", credit: 41930 },
        { hotel: "Kisar Baltistan", credit: 9500 },
        { hotel: "Transportation", credit: 70000, notes: "Fuel: 34000, Rent 36000" },
      ],
    },
    { name: "Mr Bilal", phone: "0312 9845210",
      tourDate: new Date("2026-10-17"),
      desc: "8 Days, Hunza Skardu Trip By Road", totalPackage: 650000,
      paid: 330000, salesperson: "Izza", destination: "Hunza + Skardu" },
    { name: "Dr Ali", phone: null,
      tourDate: new Date("2026-10-11"),
      desc: "5 days, Skardu By Air", totalPackage: 349000,
      paid: 260000, salesperson: "Ahmad Amjad", destination: "Skardu" },
    { name: "Mr Moiz", phone: "03181190290",
      tourDate: new Date("2026-11-01"),
      desc: "6 days, Skardu By Air", totalPackage: 200000,
      paid: 60000, salesperson: "Zunaira", destination: "Skardu" },
    { name: "Mr Shahid", phone: null,
      tourDate: new Date("2026-11-20"),
      desc: "6 days, Skardu By Air", totalPackage: 420000,
      paid: 140000, salesperson: "Talha", destination: "Skardu" },
    { name: "Mr Zeeshan", phone: "03344318829",
      tourDate: new Date("2027-05-03"),
      desc: "6 days, Skardu By Road", totalPackage: 238000,
      paid: 58000, salesperson: "Zunaira", destination: "Skardu" },
    { name: "Ms Aiman", phone: "03134816040",
      tourDate: new Date("2026-10-18"),
      desc: "5 days, Skardu By Air", totalPackage: 230000,
      paid: 110000, salesperson: "Naimal", destination: "Skardu" },
    { name: "Mr Baqir", phone: "03128147212",
      tourDate: null,
      desc: "advance payment", totalPackage: 181000,
      paid: 10000, salesperson: "Maira", destination: "Skardu" },
    { name: "Mr Abdullah Arshad", phone: "03336625623",
      tourDate: new Date("2026-10-14"),
      desc: "5 days Skardu by Air", totalPackage: 185000,
      paid: 10000, salesperson: "Maira", destination: "Skardu" },
    { name: "Mr Talha", phone: "03202525094",
      tourDate: new Date("2026-10-10"),
      desc: "5 days Skardu (by Air)", totalPackage: 175000,
      paid: 10000, salesperson: "Malika", destination: "Skardu" },
    { name: "Mr Huzaifa Sajjad", phone: "03232000301",
      tourDate: new Date("2026-10-14"),
      desc: "6 days Skardu by Air", totalPackage: 324000,
      paid: 160000, salesperson: "Malika", destination: "Skardu" },
    // Mr & Mrs Tahir: package raised +25,480 → 250,480 (remaining 180,480)
    { name: "Mr & Mrs Tahir", phone: "3317687382",
      tourDate: new Date("2026-10-14"),
      desc: "7 days Skardu Hunza by Air", totalPackage: 250480,
      paid: 70000, salesperson: "Maira", destination: "Hunza + Skardu" },
    { name: "Mr Ahmed Ayaz Khan", phone: "+92 331 7687382",
      tourDate: new Date("2026-10-14"),
      desc: "5 days Swat Kalam malam jabba", totalPackage: 232000,
      paid: 10000, salesperson: "Maira", destination: "Swat" },
    { name: "Mrs Mohsen", phone: "03354107872",
      tourDate: new Date("2026-10-17"),
      desc: "5 days Skardu", totalPackage: 220000,
      paid: 10000, salesperson: "Naimal", destination: "Skardu" },
    { name: "Mr Hassam", phone: "03036863556",
      tourDate: new Date("2026-10-14"),
      desc: "5 Days Skardu By Air", totalPackage: 255000,
      paid: 100000, salesperson: "Ashir", destination: "Skardu" },
    { name: "Mr Ali Ahmed Khan", phone: "03452886647",
      tourDate: new Date("2026-10-14"),
      desc: "4 Days Skardu By Air", totalPackage: 121000,
      paid: 5000, salesperson: "Ashir", destination: "Skardu" },
    { name: "Mr Abdullah", phone: "03425038030",
      tourDate: new Date("2026-10-12"),
      desc: "6 day skardu By Road", totalPackage: 185000,
      paid: 10000, salesperson: "Ashir", destination: "Skardu" },
    { name: "Dr Usman", phone: null,
      tourDate: new Date("2026-10-14"),
      desc: "6 days skardu Hunza by air", totalPackage: 349000,
      paid: 10000, salesperson: "Ahmad Amjad", destination: "Hunza + Skardu" },
    { name: "Waleed Iftikhar", phone: null,
      tourDate: new Date("2026-10-14"),
      desc: "4 Days / 3 Nights Skardu Trip by Air", totalPackage: 215000,
      paid: 82000, salesperson: "Ahmad Amjad", destination: "Skardu" },
    { name: "Mr & Mrs Abu Bakar", phone: null,
      tourDate: new Date("2026-10-14"),
      desc: "4 days Swat Kalam malam jabba From Islamabad", totalPackage: 135000,
      paid: 10000, salesperson: "Maira", destination: "Swat" },
  ];

  const HOTEL_KW = ["qayyam", "khoj", "kisar", "himmel", "alnoor", "rivaaj", "hatopi", "hotel", "resort", "shangrila", "grace"];

  for (const c of clients) {
    const client = await prisma.client.create({
      data: { name: c.name, phone: c.phone },
    });
    const remaining = Math.max(0, c.totalPackage - c.paid);

    await prisma.clientLedger.create({
      data: {
        clientId: client.id, clientName: c.name,
        tourDate: c.tourDate, description: c.desc,
        hotel: "Payment", debit: c.paid, credit: 0, status: "Received",
      },
    });

    if (c.costs) {
      for (const cost of c.costs) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id, clientName: c.name,
            tourDate: c.tourDate, description: c.desc,
            hotel: cost.hotel, debit: 0, credit: cost.credit,
            notes: cost.notes ?? null,
          },
        });
      }
    }

    if (remaining > 0) {
      await prisma.clientLedger.create({
        data: {
          clientId: client.id, clientName: c.name,
          tourDate: c.tourDate,
          description: `${c.desc} — outstanding`,
          category: "Receivables", hotel: "Receivables",
          debit: remaining, credit: 0, status: "Open",
          notes: "Auto-created outstanding from total package",
        },
      });
    }

    await prisma.receivable.create({
      data: {
        periodId: period.id, clientId: client.id, clientName: c.name,
        contact: c.phone,
        bookingDate: c.tourDate, tripDates: c.desc, destination: c.destination,
        salesperson: c.salesperson,
        totalPackage: c.totalPackage, amountToReceive: c.totalPackage,
        amountReceived: c.paid, remainingAmount: remaining,
        status: remaining > 0 ? "Partial" : "Settled",
      },
    });

    const hotelCost = c.costs
      ? c.costs.filter(l => HOTEL_KW.some(k => l.hotel.toLowerCase().includes(k)))
          .reduce((s, l) => s + l.credit, 0)
      : 0;
    const transportCost = c.costs
      ? c.costs.filter(l => l.hotel.toLowerCase().includes("transport"))
          .reduce((s, l) => s + l.credit, 0)
      : 0;
    const totalDirect = hotelCost + transportCost;

    await prisma.trip.create({
      data: {
        periodId: period.id, clientId: client.id, clientName: c.name,
        tripRef: c.desc, destination: c.destination, startDate: c.tourDate,
        packageRevenue: c.totalPackage, hotelCost, transportCost,
        ticketingCost: 0, otherDirectCost: 0, totalDirectCost: totalDirect,
        grossProfit: c.totalPackage - totalDirect,
        overheadAlloc: 0, netProfit: c.totalPackage - totalDirect,
        salesperson: c.salesperson, status: "Completed",
        notes: "Seeded from Oct-2026 workbook",
      },
    });
  }

  // Aggregate family row
  await prisma.receivable.create({
    data: {
      periodId: period.id, clientName: "Family (aggregate)",
      totalPackage: 2700000, amountToReceive: 2700000,
      amountReceived: 2700000, remainingAmount: 0,
      status: "Settled", notes: "Dashboard Total Amount Received",
    },
  });

  // ── Transactions ──────────────────────────────────────────────────
  // Additions this revision:
  //   • +150,000 to Shahid (Transport) — reflects the new remaining 847,000
  //   • +7,000 Personal Expenses (Bank Transfer, Jazzcash)
  //   • +25,480 added to Mr & Mrs Tahir (already in Receivable total)
  //   • +16,800 to Grace Hotel for Ms Saira (fully paid booking)
  const transactions = [
    { date: new Date("2026-10-09"), description: "Shangrila resort payment for Mr shahid booking", category: "Hotel Payment", sub: "Shangrila", party: "Shangrila", tripRef: "Mr Shahid", debit: 0, credit: 56700, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-10"), description: "5 days Skardu (by Air)", category: "Client Receipt", sub: "Mr Talha", party: "Mr Talha", debit: 10000, credit: 0, method: "Cash", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Mr Awais pending salary September", category: "Bank Transfer", sub: "Mr Awais pending salary September", party: "Mr Awais pending salary September", debit: 0, credit: 20000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "September Salary", category: "Bank Transfer", sub: "Ahmad remaining salary abi 35 Pending", party: "Ahmad remaining salary abi 35 Pending", debit: 0, credit: 45000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Ahsaan pending salary September", category: "Bank Transfer", sub: "Pending salary", party: "Pending salary", debit: 0, credit: 20000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Red line hotel (payment)", category: "Bank Transfer", sub: "Red line hotel", party: "Red line hotel", debit: 0, credit: 8000, method: "Faysal Bank", status: "Pending" },
    { date: new Date("2026-10-12"), description: "Refund to Saad bin Amir", category: "Bank Transfer", sub: "Saad Bin Amir", party: "Saad Bin Amir", debit: 0, credit: 25000, method: "Faysal Bank", status: "Completed" },
    // Personal Expenses — new, +7,000
    { date: new Date("2026-10-12"), description: "Personal Expenses", category: "Bank Transfer", sub: "Family", party: "Family", debit: 0, credit: 7000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Family Expense", category: "Bank Transfer", sub: "Family Expense", party: "Family Expense", debit: 0, credit: 150000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "6 day skardu By Road", category: "Client Receipt", sub: "Mr Abdullah", party: "Mr Abdullah", debit: 10000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Khoj resort payment against 4-5 booking", category: "Hotel Payment", sub: "Khoj", party: "Khoj", debit: 0, credit: 50000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "R & S Management Company", category: "Hotel Payment", sub: "R & S Management Company", party: "R & S Management Company", debit: 0, credit: 80000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Electric Units Office", category: "Office Expense", sub: "Electric Units Office", party: "Electric Units Office", debit: 0, credit: 10000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Ads", category: "Office Expense", sub: "Marketing", party: "Marketing", debit: 0, credit: 100000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Asad payment", category: "Transport Payment", sub: "Asad", party: "Asad", debit: 0, credit: 50000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "5 days Swat Kalam malam jabba", category: "Client Receipt", sub: "Mr Ahmed Ayaz Khan", party: "Mr Ahmed Ayaz Khan", debit: 10000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "4 Days Skardu By Air", category: "Client Receipt", sub: "Mr Ali Ahmed Khan", party: "Mr Ali Ahmed Khan", debit: 5000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "4 Days / 3 Nights Skardu Trip by Air,", category: "Client Receipt", sub: "Waleed Iftikhar", party: "Waleed Iftikhar", debit: 82000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "Employee loan", category: "Employee Loan", sub: "Mr Ahsaan", party: "Mr Ahsaan", debit: 0, credit: 1000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "4 days Swat Kalam malam jabba From Islamabad", category: "Client Receipt", sub: "Mr & Mrs Abu Bakar", party: "Mr & Mrs Abu Bakar", debit: 10000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "Khoj resort payment guest Mr huzaifa", category: "Hotel Payment", sub: "Khoj", party: "Khoj", debit: 0, credit: 45045, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "Payment", category: "Transport Payment", sub: "Asad", party: "Asad", debit: 0, credit: 150000, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "6 days skardu Hunza by air", category: "Client Receipt", sub: "Dr Usman", party: "Dr Usman", debit: 10000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "5 days Skardu by Air", category: "Client Receipt", sub: "Mr Abdullah Arshad", party: "Mr Abdullah Arshad", debit: 5000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "7 days Skardu Hunza by Air", category: "Client Receipt", sub: "Mr & Mrs Tahir", party: "Mr & Mrs Tahir", debit: 70000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "6 days Skardu by Air", category: "Client Receipt", sub: "Mr Huzaifa Sajjad", party: "Mr Huzaifa Sajjad", debit: 10000, credit: 0, method: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-14"), description: "5 Days Skardu By Air", category: "Client Receipt", sub: "Mr Hassam", party: "Mr Hassam", debit: 10000, credit: 0, method: "Faysal Bank", status: "Completed" },
    // +150,000 payment to Shahid (Transport) — brings remaining to 847,000
    { date: new Date("2026-10-15"), description: "Payment to Shahid (Transport) — additional 150k", category: "Transport Payment", sub: "Shahid", party: "Shahid", tripRef: null, debit: 0, credit: 150000, method: "Faysal Bank", status: "Completed" },
    // +25,480 added to Mr & Mrs Tahir (owed) — receipt added
    { date: new Date("2026-10-15"), description: "Additional charge added to Mr & Mrs Tahir package", category: "Client Receipt", sub: "Mr & Mrs Tahir", party: "Mr & Mrs Tahir", debit: 25480, credit: 0, method: "Faysal Bank", status: "Completed" },
    // +16,800 payment to Grace Hotel for Ms Saira (booking fully paid)
    { date: new Date("2026-10-15"), description: "Grace Hotel — Ms Saira booking fully paid", category: "Hotel Payment", sub: "Grace Hotel", party: "Grace Hotel", tripRef: "Ms Saira", debit: 0, credit: 16800, method: "Faysal Bank", status: "Completed" },
  ];
  for (const t of transactions) {
    await prisma.transaction.create({
      data: {
        periodId: period.id, date: t.date, description: t.description,
        category: t.category, subCategory: t.sub ?? null, party: t.party ?? null,
        tripRef: t.tripRef ?? null, debit: t.debit, credit: t.credit,
        paymentMethod: t.method ?? null, bankAccount: t.method ?? null,
        status: t.status,
      },
    });
  }

  // ── Office expenses ───────────────────────────────────────────────
  const office = [
    { category: "Rent", amount: 44000 },
    { category: "Electricity", amount: 30000 },
    { category: "Internet/Telephone", amount: 6000 },
    { category: "Internet/Telephone", amount: 22000 },
    { category: "Maintenance", amount: 17000 },
    { category: "Saving", amount: 260000 },
    { category: "Electric Units Office", amount: 10000, date: new Date("2026-10-12"), vendor: "Electric Units Office", method: "Faysal Bank" },
    { category: "Marketing", amount: 100000, date: new Date("2026-10-12"), vendor: "Marketing", method: "Faysal Bank", description: "Ads" },
  ];
  for (const o of office) {
    await prisma.officeExpense.create({
      data: {
        periodId: period.id, category: o.category, amount: o.amount,
        description: (o as { description?: string }).description ?? o.category,
        vendor: (o as { vendor?: string }).vendor ?? null,
        paymentMethod: (o as { method?: string }).method ?? null,
        date: (o as { date?: Date }).date ?? null,
        recurring: !(o as { date?: Date }).date,
      },
    });
  }

  // ── Marketing ────────────────────────────────────────────────────
  await prisma.marketingExpense.create({
    data: { periodId: period.id, channel: "Meta Ads", description: "Meta Ads", amount: 300000 },
  });

  // ── Assets ───────────────────────────────────────────────────────
  const assets = [
    { assetName: "Camera", category: "Camera", purchaseCost: 245000 },
    { assetName: "gimbal", category: "Camera", purchaseCost: 80000 },
    { assetName: "mic", category: "Camera", purchaseCost: 110000 },
    { assetName: "tripod", category: "Camera", purchaseCost: 18000 },
    { assetName: "storage card", category: "Camera", purchaseCost: 25000 },
    { assetName: "Abdullah Laptop", category: "Laptop", purchaseCost: 135000 },
    { assetName: "Ahsaan Laptop", category: "Laptop", purchaseCost: 180000 },
    { assetName: "Ahmad Amjad Laptop", category: "Laptop", purchaseCost: 100000 },
    { assetName: "Maira Laptop", category: "Laptop", purchaseCost: 35000 },
    { assetName: "Zunaira Laptop", category: "Laptop", purchaseCost: 35000 },
    { assetName: "Awais Laptop", category: "Laptop", purchaseCost: 35000 },
    { assetName: "Malika Laptop", category: "Laptop", purchaseCost: 35000 },
    { assetName: "Talha Laptop", category: "Laptop", purchaseCost: 35000 },
    { assetName: "Naimal Laptop", category: "Laptop", purchaseCost: 35000 },
    { assetName: "Kamran Laptop", category: "Laptop", purchaseCost: 40000, notes: "To be paid yet" },
    { assetName: "Ahsaan Phone", category: "Phone", purchaseCost: 400000 },
    { assetName: "Ahmad Amjad Phone", category: "Phone", purchaseCost: 40000 },
    { assetName: "Maira Phone", category: "Phone", purchaseCost: 40000 },
    { assetName: "Zunaira Phone", category: "Phone", purchaseCost: 40000 },
    { assetName: "Awais Phone", category: "Phone", purchaseCost: 40000 },
    { assetName: "Malika Phone", category: "Phone", purchaseCost: 40000 },
    { assetName: "Talha Phone", category: "Phone", purchaseCost: 40000 },
    { assetName: "Naimal Phone", category: "Phone", purchaseCost: 40000 },
    { assetName: "Furniture", category: "Furniture", purchaseCost: 200000 },
    { assetName: "Misc", category: "Other", purchaseCost: 100000 },
  ];
  for (const a of assets) {
    await prisma.asset.create({ data: { ...a, currentStatus: "In Use" } });
  }

  // ── Vadets ───────────────────────────────────────────────────────
  const vadets = [
    { name: "Sheeraz", amount: 494000 },
    { name: "sahmi", amount: 630000 },
    { name: "driver", amount: 85000 },
    { name: "sohaib", amount: 30000 },
    { name: "sumair", amount: 8000 },
  ];
  for (const v of vadets) {
    await prisma.vadet.create({ data: { periodId: period.id, ...v } });
  }

  // ── Sales Performance ────────────────────────────────────────────
  const salesEntries = [
    { emp: "Ahmad Amjad", date: "2026-10-14", desc: "4 Days / 3 Nights Skardu Trip by Air", client: "Waleed Iftikhar", amount: 215000 },
    { emp: "Ahmad Amjad", date: "2026-10-14", desc: "6 days skardu Hunza by air", client: "Dr Usman", amount: 349000 },
    { emp: "Ahmad Amjad", date: "2026-10-14", desc: "Reassigned sale: Dr Ali", client: "Dr Ali", amount: 349000 },
    { emp: "Ashir", date: "2026-10-14", desc: "5 Days Skardu By Air", client: "Mr Hassam", amount: 255000 },
    { emp: "Ashir", date: "2026-10-12", desc: "6 day skardu By Road", client: "Mr Abdullah", amount: 185000 },
    { emp: "Ashir", date: "2026-10-14", desc: "4 Days Skardu By Air", client: "Mr Ali Ahmed Khan", amount: 121000 },
    { emp: "Izza", date: "2026-10-14", desc: "Reassigned sale: Mr Bilal", client: "Mr Bilal", amount: 650000 },
    { emp: "Maira", date: "2026-10-14", desc: "Package increase: Mr Baqir", client: "Mr Baqir", amount: 171000 },
    { emp: "Maira", date: "2026-10-14", desc: "4 days Swat Kalam malam jabba From Islamabad", client: "Mr & Mrs Abu Bakar", amount: 135000 },
    { emp: "Maira", date: "2026-10-14", desc: "5 days Skardu by Air", client: "Mr Abdullah Arshad", amount: 185000 },
    { emp: "Maira", date: "2026-10-14", desc: "7 days Skardu Hunza by Air", client: "Mr & Mrs Tahir", amount: 250480 },
    { emp: "Maira", date: "2026-10-14", desc: "5 days Swat Kalam malam jabba", client: "Mr Ahmed Ayaz Khan", amount: 232000 },
    { emp: "Malika", date: "2026-10-10", desc: "5 days Skardu (by Air)", client: "Mr Talha", amount: 175000 },
    { emp: "Malika", date: "2026-10-14", desc: "6 days Skardu by Air", client: "Mr Huzaifa Sajjad", amount: 324000 },
    { emp: "Naimal", date: "2026-10-14", desc: "Reassigned sale: Mr Haris", client: "Mr Haris", amount: 169000 },
    { emp: "Naimal", date: "2026-10-18", desc: "Reassigned sale: Ms Aiman", client: "Ms Aiman", amount: 230000 },
    { emp: "Naimal", date: "2026-10-17", desc: "New booking: Mrs Mohsen", client: "Mrs Mohsen", amount: 220000 },
    { emp: "Talha", date: "2026-10-14", desc: "Reassigned sale: Mr Shahid", client: "Mr Shahid", amount: 420000 },
    { emp: "Zunaira", date: "2026-10-14", desc: "Reassigned sale: Mr Moiz", client: "Mr Moiz", amount: 200000 },
    { emp: "Zunaira", date: "2026-10-14", desc: "Reassigned sale: Mr Zeeshan", client: "Mr Zeeshan", amount: 238000 },
  ];
  for (const s of salesEntries) {
    await prisma.salesPerformance.create({
      data: {
        periodId: period.id, employeeName: s.emp,
        tourDate: new Date(s.date), description: s.desc,
        category: "Sale", clientName: s.client, debit: s.amount, credit: 0,
        status: "Completed",
      },
    });
  }

  // ── Commissions ──────────────────────────────────────────────────
  const commissionData = [
    { emp: "Mr Ahsaan", sale: 0, rate: 2.5, amt: 0 },
    { emp: "Ahmad Amjad", sale: 4095000, rate: 0, amt: 55000, notes: "Team Lead - fixed 55,000 (team sales < 70 lacs)" },
    { emp: "Maira", sale: 973480, rate: 2.5, amt: 24337 },
    { emp: "Zunaira", sale: 438000, rate: 2.5, amt: 10950 },
    { emp: "Awais", sale: 0, rate: 2.5, amt: 0 },
    { emp: "Malika", sale: 674000, rate: 2.5, amt: 16850 },
    { emp: "Talha", sale: 420000, rate: 2.5, amt: 10500 },
    { emp: "Naimal", sale: 414000, rate: 2.5, amt: 10350 },
    { emp: "Ashir", sale: 551000, rate: 2.5, amt: 13775 },
    { emp: "Izza", sale: 650000, rate: 2.5, amt: 16250 },
  ];
  for (const c of commissionData) {
    await prisma.commission.create({
      data: {
        periodId: period.id,
        employeeId: employees[c.emp],
        employeeName: c.emp,
        saleAmount: c.sale, commissionRate: c.rate,
        commissionAmt: c.amt, status: "Accrued",
        notes: (c as { notes?: string }).notes ?? null,
      },
    });
  }

  // ── Sales target ─────────────────────────────────────────────────
  await prisma.salesTarget.create({
    data: {
      periodId: period.id,
      targetAmount: 12000000,
      commissionBaseAmount: 7000000,
    },
  });

  console.log("✅ Seed complete — Oct-2026 reconciled data loaded.");
  console.log("   Faysal Bank balance: 27,070");
  console.log("   Jazzcash: 651  ·  Easypaisa: 282  ·  UBL: 0");
  console.log("   Clients:", clients.length, "+ Family aggregate");
  console.log("   Transactions:", transactions.length);
  console.log("   Shahid (Transport) remaining: 847,000");
  console.log("   Mr & Mrs Tahir total package: 250,480 (includes +25,480)");
  console.log("   Grace Hotel (Ms Saira): fully paid");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());