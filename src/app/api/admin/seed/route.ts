// src/lib/seed.ts
import { prisma } from "./prisma";

export async function runSeed(force: boolean = false) {
  // Safety: refuse if DB already has data unless force=true
  if (!force) {
    const periodCount = await prisma.period.count();
    if (periodCount > 0) {
      return {
        ok: false,
        message: `Database already has ${periodCount} period(s). Pass force=true to wipe and reseed.`,
      };
    }
  }

  // ── Wipe all tables ──
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

  // ── Period ──
  const period = await prisma.period.create({
    data: { year: 2026, month: 10, label: "Oct-2026" },
  });

  // ── Employees ──
  const empData = [
    { name: "Mr Ahsaan",     role: "Sales",            basicSalary: 40000 },
    { name: "Amad Amjad",    role: "Sales",            basicSalary: 0     },
    { name: "Maira",         role: "Sales",            basicSalary: 40000 },
    { name: "Zunaira",       role: "Sales",            basicSalary: 40000 },
    { name: "Awais",         role: "Sales",            basicSalary: 40000 },
    { name: "Malika",        role: "Sales",            basicSalary: 40000 },
    { name: "Talha",         role: "Sales",            basicSalary: 40000 },
    { name: "Naimal",        role: "Sales",            basicSalary: 40000 },
    { name: "Ashir",         role: "Sales",            basicSalary: 40000 },
    { name: "Izza",          role: "Sales",            basicSalary: 40000 },
    { name: "Ahmed",         role: "Graphic Designer", basicSalary: 50000 },
    { name: "Faysal",        role: "Meta Marketing",   basicSalary: 50000 },
    { name: "Abdullah",      role: "CEO",              basicSalary: 60000 },
    { name: "Kamran",        role: "Accountant",       basicSalary: 30000 },
    { name: "WAseem Akram",  role: "Legal Team",       basicSalary: 40000 },
    { name: "Nadeem",        role: "Office Boy",       basicSalary: 10000 },
  ];
  const employees: Record<string, string> = {};
  for (const e of empData) {
    const row = await prisma.employee.create({ data: e });
    employees[e.name] = row.id;
  }

  // ── Employee Loans ──
  const loans = [
    { name: "Mr Ahsaan",  original: 630000, remaining: 630000, installment: 30000 },
    { name: "Amad Amjad", original: 200000, remaining: 200000, installment: 20000 },
    { name: "Awais",      original: 110000, remaining: 110000, installment: 20000 },
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

  // ── Payroll ──
  const payroll = [
    { name: "Mr Ahsaan",    basic: 40000, bonus: 0,     loan: 30000, net: 10000 },
    { name: "Amad Amjad",   basic: 0,     bonus: 0,     loan: 20000, net: 0     },
    { name: "Maira",        basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Zunaira",      basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Awais",        basic: 40000, bonus: 0,     loan: 20000, net: 20000 },
    { name: "Malika",       basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Talha",        basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Naimal",       basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Ashir",        basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Izza",         basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Ahmed",        basic: 50000, bonus: 13000, loan: 0,     net: 63000 },
    { name: "Faysal",       basic: 50000, bonus: 0,     loan: 0,     net: 50000 },
    { name: "Abdullah",     basic: 60000, bonus: 0,     loan: 0,     net: 60000 },
    { name: "Kamran",       basic: 30000, bonus: 0,     loan: 0,     net: 30000 },
    { name: "WAseem Akram", basic: 40000, bonus: 0,     loan: 0,     net: 40000 },
    { name: "Nadeem",       basic: 10000, bonus: 0,     loan: 0,     net: 10000 },
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

  // ── Bank ──
  const banks = [
    { accountName: "UBL",         balance: 0 },
    { accountName: "Faysal Bank", balance: 370000 },
    { accountName: "Meezan Bank", balance: 0 },
    { accountName: "Easypaisa",   balance: 282 },
    { accountName: "Jazzcash",    balance: 10472 },
  ];
  for (const b of banks) await prisma.bankBalance.create({ data: b });

  // ── Payables + Hotels/Transport ──
  const payablesData = [
    { supplierName: "Hatopi Resort",   category: "Hotel",     originalAmount: 924000,  amountPaid: 300000 },
    { supplierName: "Alnoor",          category: "Hotel",     originalAmount: 700000,  amountPaid: 300000 },
    { supplierName: "Qayyam Hunza",    category: "Hotel",     originalAmount: 219000,  amountPaid: 150000 },
    { supplierName: "Himmel",          category: "Hotel",     originalAmount: 490000,  amountPaid: 250000 },
    { supplierName: "Qayyam Skardu",   category: "Hotel",     originalAmount: 403000,  amountPaid: 250000 },
    { supplierName: "Shahid",          category: "Transport", originalAmount: 1079000, amountPaid: 600000 },
    { supplierName: "Asad",            category: "Transport", originalAmount: 291790,  amountPaid: 150000 },
    { supplierName: "Rivaaj",          category: "Hotel",     originalAmount: 314670,  amountPaid: 150000 },
    { supplierName: "Kisar Baltistan", category: "Hotel",     originalAmount: 461900,  amountPaid: 400000 },
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
      },
    });
    if (p.category === "Hotel") {
      await prisma.hotelBooking.create({
        data: {
          periodId: period.id,
          hotelName: p.supplierName,
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

  // ── Office Expenses ──
  const office = [
    { category: "Rent",               amount: 44000 },
    { category: "Electricity",        amount: 30000 },
    { category: "Internet/Telephone", amount: 6000 },
    { category: "Internet/Telephone", amount: 22000 },
    { category: "Maintenance",        amount: 17000 },
    { category: "Saving",             amount: 260000 },
  ];
  for (const o of office) {
    await prisma.officeExpense.create({
      data: { periodId: period.id, ...o, description: o.category, recurring: true },
    });
  }

  // ── Marketing ──
  await prisma.marketingExpense.create({
    data: { periodId: period.id, channel: "Meta Ads", description: "Meta Ads", amount: 300000 },
  });

  // ── Assets ──
  const assets = [
    { assetName: "Camera",             category: "Camera",    purchaseCost: 245000 },
    { assetName: "gimbal",             category: "Camera",    purchaseCost: 80000 },
    { assetName: "mic",                category: "Camera",    purchaseCost: 110000 },
    { assetName: "tripod",             category: "Camera",    purchaseCost: 18000 },
    { assetName: "storage card",       category: "Camera",    purchaseCost: 25000 },
    { assetName: "Abdullah Laptop",    category: "Laptop",    purchaseCost: 135000 },
    { assetName: "Ahsaan Laptop",      category: "Laptop",    purchaseCost: 180000 },
    { assetName: "Ahmad Amjad Laptop", category: "Laptop",    purchaseCost: 100000 },
    { assetName: "Maira Laptop",       category: "Laptop",    purchaseCost: 35000 },
    { assetName: "Zunaira Laptop",     category: "Laptop",    purchaseCost: 35000 },
    { assetName: "Awais Laptop",       category: "Laptop",    purchaseCost: 35000 },
    { assetName: "Malika Laptop",      category: "Laptop",    purchaseCost: 35000 },
    { assetName: "Talha Laptop",       category: "Laptop",    purchaseCost: 35000 },
    { assetName: "Naimal Laptop",      category: "Laptop",    purchaseCost: 35000 },
    { assetName: "Kamran Laptop",      category: "Laptop",    purchaseCost: 40000, notes: "To be paid yet" },
    { assetName: "Ahsaan Phone",       category: "Phone",     purchaseCost: 400000 },
    { assetName: "Amad Amjad Phone",   category: "Phone",     purchaseCost: 40000 },
    { assetName: "Maira Phone",        category: "Phone",     purchaseCost: 40000 },
    { assetName: "Zunaira Phone",      category: "Phone",     purchaseCost: 40000 },
    { assetName: "Awais Phone",        category: "Phone",     purchaseCost: 40000 },
    { assetName: "Malika Phone",       category: "Phone",     purchaseCost: 40000 },
    { assetName: "Talha Phone",        category: "Phone",     purchaseCost: 40000 },
    { assetName: "Naimal Phone",       category: "Phone",     purchaseCost: 40000 },
    { assetName: "Furniture",          category: "Furniture", purchaseCost: 200000 },
    { assetName: "Misc",               category: "Other",     purchaseCost: 100000 },
  ];
  for (const a of assets) {
    await prisma.asset.create({ data: { ...a, currentStatus: "In Use" } });
  }

  // ── Vadets ──
  const vadets = [
    { name: "Sheeraz", amount: 494000 },
    { name: "sahmi",   amount: 630000 },
    { name: "driver",  amount: 85000 },
    { name: "sohaib",  amount: 30000 },
    { name: "sumair",  amount: 8000 },
  ];
  for (const v of vadets) {
    await prisma.vadet.create({ data: { periodId: period.id, ...v } });
  }

  // ── Clients + Receivables + Ledger ──
  const clientRows = [
    {
      name: "Mr Haris",
      tourDate: new Date("2026-10-05"),
      desc: "5 days, Skardu By Air",
      received: 169000,
      totalPackage: 169000,
      remaining: 0,
      ledger: [
        { hotel: "Qayyam (2x nights)", credit: 34650 },
        { hotel: "Khoj",               credit: 41930 },
        { hotel: "Kisar Baltistan",    credit: 9500  },
        { hotel: "Transportation",     credit: 70000, notes: "Fuel: 34000, Rent 36000" },
      ],
    },
    { name: "Mr Bilal",   tourDate: new Date("2026-10-17"), desc: "8 Days, Hunza Skardu Trip By Road", received: 330000, totalPackage: 650000, remaining: 320000 },
    { name: "Dr Ali",     tourDate: new Date("2026-10-11"), desc: "5 days, Skardu By Air",             received: 260000, totalPackage: 349000, remaining: 89000  },
    { name: "Mr Moiz",    tourDate: new Date("2026-11-01"), desc: "6 days, Skardu By Air",             received: 10000,  totalPackage: 200000, remaining: 190000 },
    { name: "Mr Shahid",  tourDate: new Date("2026-11-20"), desc: "6 days, Skardu By Air",             received: 140000, totalPackage: 420000, remaining: 280000 },
    { name: "Mr Zeeshan", tourDate: new Date("2027-05-03"), desc: "6 days, Skardu By Road",            received: 10000,  totalPackage: 238000, remaining: 228000 },
    { name: "Ms Aiman",   tourDate: new Date("2026-10-18"), desc: "5 days, Skardu By Air",             received: 10000,  totalPackage: 245000, remaining: 235000 },
  ];

  for (const c of clientRows) {
    const client = await prisma.client.create({
      data: { name: c.name, contact: c.desc },
    });

    await prisma.clientLedger.create({
      data: {
        clientId: client.id,
        clientName: c.name,
        tourDate: c.tourDate,
        description: c.desc,
        hotel: "Payment",
        debit: c.received,
        credit: 0,
        status: "Received",
      },
    });

    if ("ledger" in c && c.ledger) {
      for (const cost of c.ledger) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id,
            clientName: c.name,
            tourDate: c.tourDate,
            description: c.desc,
            hotel: cost.hotel,
            debit: 0,
            credit: cost.credit,
            notes: cost.notes || null,
          },
        });
      }
    }

    if (c.remaining > 0) {
      await prisma.clientLedger.create({
        data: {
          clientId: client.id,
          clientName: c.name,
          tourDate: c.tourDate,
          description: `${c.desc} — outstanding`,
          hotel: "Receivables",
          debit: c.remaining,
          credit: 0,
          status: "Open",
        },
      });
    }

    await prisma.receivable.create({
      data: {
        periodId: period.id,
        clientId: client.id,
        clientName: c.name,
        bookingDate: c.tourDate,
        tripDates: c.desc,
        totalPackage: c.totalPackage,
        amountToReceive: c.totalPackage,
        amountReceived: c.received,
        remainingAmount: c.remaining,
        status: c.remaining > 0 ? "Partial" : "Settled",
      },
    });
  }

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

  return {
    ok: true,
    message: "Seed complete",
    counts: {
      employees: empData.length,
      loans: loans.length,
      payroll: payroll.length,
      banks: banks.length,
      payables: payablesData.length,
      officeExpenses: office.length,
      assets: assets.length,
      vadets: vadets.length,
      clients: clientRows.length,
    },
  };
}