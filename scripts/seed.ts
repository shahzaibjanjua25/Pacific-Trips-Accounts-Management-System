/**
 * Seed Oct-2026 data from Pacific Trips Excel workbooks (exact figures).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const force = process.argv.includes("--force");
  if (process.env.NODE_ENV === "production" && !force) {
    console.error("❌ Refusing to seed in production without --force.");
    process.exit(1);
  }

  // ── Wipe ──
  const tables = [
    "transactionLink",
    "clientLedger", "salesPerformance", "vadet", "ownerTxn", "liability", "asset",
    "bankTxn", "bankBalance", "pettyCashTxn", "marketingExpense", "officeExpense",
    "commission", "payrollEntry", "employeeLoan", "refund", "supplierAdvance",
    "ticketing", "transportJob", "hotelBooking", "payable", "trip", "receivable",
    "transaction", "client", "employee", "period",
  ] as const;
  for (const t of tables) {
    // @ts-expect-error dynamic
    await prisma[t].deleteMany();
  }

  const period = await prisma.period.create({
    data: { year: 2026, month: 10, label: "Oct-2026" },
  });
  console.log("Period:", period.label);

  // ── Employees ──
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

  // ── Loans ──
  const loans = [
    { name: "Mr Ahsaan", original: 630000, remaining: 600000, installment: 30000 },
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

  // ── Payroll (matches Payroll sheet; Ahmed bonus modelled via negative otherDeductions) ──
  const payroll = [
    { name: "Mr Ahsaan", basic: 40000, bonus: 0, loan: 30000, net: 10000, notes: "Loan 630k, installment 30k" },
    { name: "Ahmad Amjad", basic: 0, bonus: 0, loan: 20000, net: 0, notes: "Team Lead — commission via Compute button" },
    { name: "Maira", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Zunaira", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Awais", basic: 40000, bonus: 0, loan: 20000, net: 20000, notes: "Loan 110k, installment 20k" },
    { name: "Malika", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Talha", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Naimal", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Ashir", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Izza", basic: 40000, bonus: 0, loan: 0, net: 40000 },
    { name: "Ahmed", basic: 50000, bonus: 13000, loan: 0, net: 63000, notes: "Bonus 13,000 included" },
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
        status: "Pending",
        notes: p.notes || null,
      },
    });
  }
  await prisma.payrollEntry.updateMany({
    where: { periodId: period.id, employeeName: "Ahmed" },
    data: { otherDeductions: -13000 },
  });

  // ── Bank (matches Bank sheet: Faysal = -244,700, Jazzcash = 5,472) ──
  const banks = [
    { accountName: "UBL", balance: 0 },
    { accountName: "Meezan Bank", balance: 0 },
    { accountName: "Easypaisa", balance: 282 },
    { accountName: "Jazzcash", balance: 5472 },
    { accountName: "Faysal Bank", balance: -244700 },
  ];
  for (const b of banks) {
    await prisma.bankBalance.create({ data: b });
  }

  // ── Payables — matches Payables sheet (including the 3 auto-created from Transactions) ──
  const payablesData = [
    { supplierName: "Shangrila", category: "Hotel", originalAmount: 56700, amountPaid: 56700, tripRef: "Mr Shahid", notes: "Auto-created from transaction" },
    { supplierName: "Khoj", category: "Hotel", originalAmount: 50000, amountPaid: 50000, notes: "Auto-created from transaction" },
    { supplierName: "R & S Management Company", category: "Hotel", originalAmount: 80000, amountPaid: 80000, notes: "Auto-created from transaction" },
    { supplierName: "Hatopi Resort", category: "Hotel", originalAmount: 924000, amountPaid: 300000 },
    { supplierName: "Alnoor", category: "Hotel", originalAmount: 700000, amountPaid: 300000 },
    { supplierName: "Qayyam Hunza", category: "Hotel", originalAmount: 219000, amountPaid: 150000 },
    { supplierName: "Himmel", category: "Hotel", originalAmount: 490000, amountPaid: 250000 },
    { supplierName: "Qayyam Skardu", category: "Hotel", originalAmount: 403000, amountPaid: 250000 },
    { supplierName: "Shahid", category: "Transport", originalAmount: 1079000, amountPaid: 600000 },
    { supplierName: "Asad", category: "Transport", originalAmount: 291790, amountPaid: 200000 },
    { supplierName: "Rivaaj", category: "Hotel", originalAmount: 314670, amountPaid: 150000 },
    { supplierName: "Kisar Baltistan", category: "Hotel", originalAmount: 461900, amountPaid: 400000 },
  ];
  for (const p of payablesData) {
    const remaining = Math.max(0, p.originalAmount - p.amountPaid);
    const payable = await prisma.payable.create({
      data: {
        periodId: period.id,
        supplierName: p.supplierName,
        category: p.category,
        originalAmount: p.originalAmount,
        amountPaid: p.amountPaid,
        remaining,
        status: remaining <= 0 ? "Paid" : p.amountPaid > 0 ? "Partial" : "Open",
        notes: p.notes ?? null,
      },
    });

    if (p.category === "Hotel") {
      await prisma.hotelBooking.create({
        data: {
          periodId: period.id,
          hotelName: p.supplierName,
          tripRef: p.tripRef ?? null,
          status: remaining <= 0 ? "Paid" : p.amountPaid > 0 ? "Partial" : "Booked",
          payableId: payable.id,
        },
      });
    } else if (p.category === "Transport") {
      await prisma.transportJob.create({
        data: {
          periodId: period.id,
          driverName: p.supplierName,
          status: remaining <= 0 ? "Settled" : p.amountPaid > 0 ? "Partial" : "Pending",
          payableId: payable.id,
        },
      });
    }
  }

  // ── Office expenses (matches OfficeExpenses sheet) ──
  const office = [
    { category: "Rent", amount: 44000 },
    { category: "Electricity", amount: 30000 },
    { category: "Internet/Telephone", amount: 6000 },
    { category: "Internet/Telephone", amount: 22000 },
    { category: "Maintenance", amount: 17000 },
    { category: "Saving", amount: 260000 },
    { category: "Electric Units Office", amount: 10000, date: new Date("2026-10-12"), vendor: "Electric Units Office", paymentMethod: "Faysal Bank" },
    { category: "Marketing", amount: 100000, date: new Date("2026-10-12"), vendor: "Marketing", paymentMethod: "Faysal Bank", description: "Ads" },
  ];
  for (const o of office) {
    await prisma.officeExpense.create({
      data: {
        periodId: period.id,
        category: o.category,
        amount: o.amount,
        description: (o as any).description ?? o.category,
        vendor: (o as any).vendor ?? null,
        paymentMethod: (o as any).paymentMethod ?? null,
        date: (o as any).date ?? null,
        recurring: !(o as any).date,
      },
    });
  }

  // ── Marketing (matches Marketing sheet) ──
  await prisma.marketingExpense.create({
    data: {
      periodId: period.id,
      channel: "Meta Ads",
      description: "Meta Ads",
      amount: 300000,
    },
  });

  // ── Assets (unchanged) ──
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

  // ── Vadets (unchanged) ──
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

  // ── Clients + Ledger + Receivables ──
  // totalPackage now taken from the Receivables sheet "Total Package" column.
  const clientRows: Array<{
    name: string;
    tourDate: Date | null;
    desc: string;
    payment: number;
    totalPackage: number;
    costs?: Array<{ hotel: string; credit: number; notes?: string }>;
    salesperson?: string;
    notes?: string;
  }> = [
      {
        name: "Mr Haris",
        tourDate: new Date("2026-10-05"),
        desc: "5 days, Skardu By Air",
        payment: 169000,
        totalPackage: 169000,
        costs: [
          { hotel: "Qayyam (2x nights)", credit: 34650 },
          { hotel: "Khoj", credit: 41930 },
          { hotel: "Kisar Baltistan", credit: 9500 },
          { hotel: "Transportation", credit: 70000, notes: "Fuel: 34000, Rent 36000" },
        ],
      },
      {
        name: "Mr Bilal",
        tourDate: new Date("2026-10-17"),
        desc: "8 Days, Hunza Skardu Trip By Road",
        payment: 330000,
        totalPackage: 650000,
      },
      {
        name: "Dr Ali",
        tourDate: new Date("2026-10-11"),
        desc: "5 days, Skardu By Air",
        payment: 260000,
        totalPackage: 349000,
      },
      {
        name: "Mr Moiz",
        tourDate: new Date("2026-11-01"),
        desc: "6 days, Skardu By Air",
        payment: 10000,
        totalPackage: 200000,
      },
      {
        name: "Mr Shahid",
        tourDate: new Date("2026-11-20"),
        desc: "6 days, Skardu By Air",
        payment: 140000,
        totalPackage: 420000,
      },
      {
        name: "Mr Zeeshan",
        tourDate: new Date("2027-05-03"),
        desc: "6 days, Skardu By Road",
        payment: 10000,
        totalPackage: 238000,
      },
      {
        name: "Ms Aiman",
        tourDate: new Date("2026-10-18"),
        desc: "5 days, Skardu By Air",
        payment: 10000,
        totalPackage: 245000,
      },
      {
        name: "Mr Baqir",
        tourDate: null,
        desc: "advance payment",
        payment: 10000,
        totalPackage: 10000,
        salesperson: "Maira",
        notes: "Auto-created from transaction",
      },
    ];

  for (const c of clientRows) {
    const client = await prisma.client.create({ data: { name: c.name } });

    // Payment line
    await prisma.clientLedger.create({
      data: {
        clientId: client.id,
        tourDate: c.tourDate,
        description: c.desc,
        clientName: c.name,
        hotel: "Payment",
        debit: c.payment,
        credit: 0,
      },
    });

    // Cost lines (Mr Haris only in the sheets)
    if (c.costs) {
      for (const cost of c.costs) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id,
            tourDate: c.tourDate,
            description: c.desc,
            clientName: c.name,
            hotel: cost.hotel,
            debit: 0,
            credit: cost.credit,
            notes: cost.notes || null,
          },
        });
      }
    }

    const remaining = Math.max(0, c.totalPackage - c.payment);
    await prisma.receivable.create({
      data: {
        periodId: period.id,
        clientId: client.id,
        clientName: c.name,
        bookingDate: c.tourDate,
        tripDates: c.desc,
        totalPackage: c.totalPackage,
        amountToReceive: c.totalPackage,
        amountReceived: c.payment,
        remainingAmount: remaining,
        salesperson: c.salesperson ?? null,
        status: remaining > 0 ? "Partial" : "Settled",
        notes: c.notes ?? null,
      },
    });
  }

  // Family aggregate (no clientId — matches "Family (aggregate)" row)
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Family (aggregate)",
      totalPackage: 2700000,
      amountToReceive: 2700000,
      amountReceived: 2700000,
      remainingAmount: 0,
      status: "Settled",
      notes: "Dashboard Total Amount Received",
    },
  });

  // ── Transactions (matches Transactions sheet) ──
  const transactions = [
    { date: new Date("2026-10-09"), description: "Shangrila resort payment for Mr shahid booking", category: "Hotel Payment", subCategory: "Shangrila", clientVendor: "Shangrila", tripRef: "Mr Shahid", debit: 0, credit: 56700, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Personal Expenses", category: "Bank Transfer", subCategory: "Family", clientVendor: "Family", debit: 0, credit: 5000, paymentMethod: "Jazzcash", bankAccount: "Jazzcash", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Family Expense", category: "Bank Transfer", subCategory: "Family Expense", clientVendor: "Family Expense", debit: 0, credit: 150000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Mr Awais pending salary September", category: "Bank Transfer", subCategory: "Mr Awais pending salary September", clientVendor: "Mr Awais pending salary September", debit: 0, credit: 20000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "September Salary", category: "Bank Transfer", subCategory: "Ahmad remaining salary abi 35 Pending", clientVendor: "Ahmad remaining salary abi 35 Pending", debit: 0, credit: 45000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Ahsaan pending salary September", category: "Bank Transfer", subCategory: "Pending salary", clientVendor: "Pending salary", debit: 0, credit: 20000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Red line hotel (payment)", category: "Bank Transfer", subCategory: "Red line hotel", clientVendor: "Red line hotel", debit: 0, credit: 8000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Pending" },
    { date: new Date("2026-10-12"), description: "Khoj resort payment against 4-5 booking", category: "Hotel Payment", subCategory: "Khoj", clientVendor: "Khoj", debit: 0, credit: 50000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "R & S Management Company", category: "Hotel Payment", subCategory: "R & S Management Company", clientVendor: "R & S Management Company", debit: 0, credit: 80000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Electric Units Office", category: "Office Expense", subCategory: "Electric Units Office", clientVendor: "Electric Units Office", debit: 0, credit: 10000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Ads", category: "Office Expense", subCategory: "Marketing", clientVendor: "Marketing", debit: 0, credit: 100000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Refund to Saad bin Amir", category: "Bank Transfer", subCategory: "Saad Bin Amir", clientVendor: "Saad Bin Amir", debit: 0, credit: 25000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
    { date: new Date("2026-10-12"), description: "Asad payment", category: "Transport Payment", subCategory: "Asad", clientVendor: "Asad", debit: 0, credit: 50000, paymentMethod: "Faysal Bank", bankAccount: "Faysal Bank", status: "Completed" },
  ];
  for (const t of transactions) {
    await prisma.transaction.create({
      data: {
        periodId: period.id,
        date: t.date,
        description: t.description,
        category: t.category,
        subCategory: t.subCategory ?? null,
        party: t.clientVendor ?? null,          // ✅ map to `party`
        tripRef: t.tripRef ?? null,
        debit: t.debit,
        credit: t.credit,
        paymentMethod: t.paymentMethod ?? null,
        bankAccount: t.bankAccount ?? null,
        status: t.status,
      },
    });
  }

  console.log("Seed complete — Oct-2026 data from Excel loaded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());