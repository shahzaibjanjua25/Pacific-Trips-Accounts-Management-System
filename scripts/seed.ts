/**
 * Seed Oct-2026 data from Pacific Trips Excel workbooks (exact figures).
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Wipe
  const tables = [
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
    { name: "Amad Amjad", role: "Sales", basicSalary: 0 }, // Team Lead-Sales
    { name: "Maira", role: "Sales", basicSalary: 40000 },
    { name: "Zunaira", role: "Sales", basicSalary: 40000 },
    { name: "Awais", role: "Sales", basicSalary: 40000 },
    { name: "Malika", role: "Sales", basicSalary: 40000 },
    { name: "Talha", role: "Sales", basicSalary: 40000 },
    { name: "Naimal", role: "Sales", basicSalary: 40000 },
    { name: "Ashir", role: "Sales", basicSalary: 40000 },
    { name: "Izza", role: "Sales", basicSalary: 40000 },
    { name: "Ahmed", role: "Graphic Designer", basicSalary: 50000 },
    { name: "Faisal", role: "Meta Marketing", basicSalary: 50000 },
    { name: "Abdullah", role: "CEO", basicSalary: 60000 },
    { name: "Kamran", role: "Accountant", basicSalary: 30000 },
    { name: "WAseem Akram", role: "Legal Team", basicSalary: 40000 },
    { name: "Nadeem", role: "Office Boy", basicSalary: 10000 },
  ];
  // Designation labels for Team column (display)
  const designation: Record<string, string> = {
    "Mr Ahsaan": "Sales",
    "Amad Amjad": "Team Lead-Sales",
    "Maira": "Sales",
    "Zunaira": "Sales",
    "Awais": "Sales",
    "Malika": "Sales",
    "Talha": "Sales",
    "Naimal": "Sales",
    "Ashir": "Sales",
    "Izza": "Sales",
    "Ahmed": "Grapich Designer",
    "Faisal": "meta marketing",
    "Abdullah": "CEO",
    "Kamran": "Acoountant",
    "WAseem Akram": "Legal Team",
    "Nadeem": "Office Boy",
  };
  const employees: Record<string, string> = {};
  for (const e of empData) {
    const row = await prisma.employee.create({ data: e });
    employees[e.name] = row.id;
  }

  // ── Loans (from Payroll sheet) ──
  const loans = [
    { name: "Mr Ahsaan", original: 630000, remaining: 600000, installment: 30000 },
    { name: "Amad Amjad", original: 200000, remaining: 180000, installment: 20000 },
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

  // ── Payroll (exact Net Salary from Excel) ──
  const payroll = [
    { name: "Mr Ahsaan", basic: 40000, loan: 30000, net: 10000, notes: "Loan 630k, installment 30k" },
    { name: "Amad Amjad", basic: 0, loan: 20000, net: -20000, notes: "Team Lead — no basic; loan installment 20k" },
    { name: "Maira", basic: 40000, loan: 0, net: 40000 },
    { name: "Zunaira", basic: 40000, loan: 0, net: 40000 },
    { name: "Awais", basic: 40000, loan: 20000, net: 20000, notes: "Loan 110k, installment 20k" },
    { name: "Malika", basic: 40000, loan: 0, net: 40000 },
    { name: "Talha", basic: 40000, loan: 0, net: 40000 },
    { name: "Naimal", basic: 40000, loan: 0, net: 40000 },
    { name: "Ashir", basic: 40000, loan: 0, net: 40000 },
    { name: "Izza", basic: 40000, loan: 0, net: 40000 },
    { name: "Ahmed", basic: 50000, loan: 0, net: 63000, notes: "Bonus 13000" },
    { name: "Faisal", basic: 50000, loan: 0, net: 50000 },
    { name: "Abdullah", basic: 60000, loan: 0, net: 60000 },
    { name: "Kamran", basic: 30000, loan: 0, net: 30000 },
    { name: "WAseem Akram", basic: 40000, loan: 0, net: 40000 },
    { name: "Nadeem", basic: 10000, loan: 0, net: 10000 },
  ];
  for (const p of payroll) {
    await prisma.payrollEntry.create({
      data: {
        periodId: period.id,
        employeeId: employees[p.name],
        employeeName: p.name,
        basicSalary: p.basic,
        loanInstallment: p.loan,
        otherDeductions: p.name === "Ahmed" ? 0 : 0,
        // Ahmed: basic 50k + bonus 13k = 63k — store bonus in notes; netPayable exact
        netPayable: p.net,
        status: "Pending",
        notes: p.notes || null,
      },
    });
  }
  // Store Ahmed bonus as negative otherDeductions doesn't work — net is already 63000
  await prisma.payrollEntry.updateMany({
    where: { periodId: period.id, employeeName: "Ahmed" },
    data: { otherDeductions: -13000 }, // so basic - loan - other = 50k - 0 - (-13k) = 63k if recalculated
  });

  // ── Bank ──
  const banks = [
    { accountName: "UBL", balance: 0 },
    { accountName: "Faisal / Meezan", balance: 370000 },
    { accountName: "Easypaisa", balance: 282 },
    { accountName: "Jazzcash", balance: 10472 },
  ];
  for (const b of banks) {
    await prisma.bankBalance.create({ data: b });
  }

  // ── Payables ──
  const payables = [
    { supplierName: "Hatopi Resort", category: "Hotel", originalAmount: 924000, amountPaid: 300000, remaining: 624000 },
    { supplierName: "Alnoor", category: "Hotel", originalAmount: 700000, amountPaid: 300000, remaining: 400000 },
    { supplierName: "Qayyam Hunza", category: "Hotel", originalAmount: 219000, amountPaid: 150000, remaining: 69000 },
    { supplierName: "Himmel", category: "Hotel", originalAmount: 490000, amountPaid: 250000, remaining: 240000 },
    { supplierName: "Qayyam Skardu", category: "Hotel", originalAmount: 403000, amountPaid: 250000, remaining: 153000 },
    { supplierName: "Shahid", category: "Transport", originalAmount: 1079000, amountPaid: 600000, remaining: 479000 },
    { supplierName: "Asad", category: "Transport", originalAmount: 291790, amountPaid: 150000, remaining: 141790 },
    { supplierName: "Rivaaj", category: "Hotel", originalAmount: 314670, amountPaid: 150000, remaining: 164670 },
    { supplierName: "Kisar Baltistan", category: "Hotel", originalAmount: 461900, amountPaid: 400000, remaining: 61900 },
  ];
  for (const p of payables) {
    await prisma.payable.create({
      data: {
        periodId: period.id,
        ...p,
        status: p.remaining > 0 ? "Partial" : "Paid",
      },
    });
  }

  // ── Office expenses ──
  const office = [
    { category: "Rent", amount: 44000 },
    { category: "Electricity", amount: 30000 },
    { category: "Internet/Telephone", amount: 6000 },
    { category: "Internet/Telephone", amount: 22000 },
    { category: "Maintenance", amount: 17000 },
    { category: "Saving", amount: 260000 },
  ];
  for (const o of office) {
    await prisma.officeExpense.create({
      data: { periodId: period.id, ...o, description: o.category, recurring: true },
    });
  }

  // ── Marketing ──
  await prisma.marketingExpense.create({
    data: {
      periodId: period.id,
      channel: "Meta Ads",
      description: "Meta Ads",
      amount: 300000,
    },
  });

  // ── Assets ──
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
    { assetName: "Amad Amjad Phone", category: "Phone", purchaseCost: 40000 },
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
    await prisma.asset.create({
      data: { ...a, currentStatus: "In Use" },
    });
  }

  // ── Vadets ──
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

  // ── Clients + Receivables + ledger from Client Data.xlsx ──
  const clientRows = [
    {
      name: "Mr Haris",
      tourDate: new Date("2026-10-05"),
      desc: "5 days, Skardu By Air",
      payment: 169000,
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
      receivable: 320000,
    },
    {
      name: "Dr Ali",
      tourDate: new Date("2026-10-11"),
      desc: "5 days, Skardu By Air",
      payment: 260000,
      receivable: 89000,
    },
    {
      name: "Mr Moiz",
      tourDate: new Date("2026-11-01"),
      desc: "6 days, Skardu By Air",
      payment: 10000,
      receivable: 190000,
    },
    {
      name: "Mr Shahid",
      tourDate: new Date("2026-11-20"),
      desc: "6 days, Skardu By Air",
      payment: 140000,
      receivable: 280000,
    },
    {
      name: "Mr Zeeshan",
      tourDate: new Date("2027-05-03"),
      desc: "6 days, Skardu By Road",
      payment: 10000,
      receivable: 228000,
    },
    {
      name: "Ms Aiman",
      tourDate: new Date("2026-10-18"),
      desc: "5 days, Skardu By Air",
      payment: 10000,
      receivable: 235000,
    },
  ];

  for (const c of clientRows) {
    const client = await prisma.client.create({ data: { name: c.name } });

    // Payment received
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

    if (c.costs) {
      for (const cost of c.costs) {
        await prisma.clientLedger.create({
          data: {
            clientId: client.id,
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

    if (c.receivable) {
      await prisma.clientLedger.create({
        data: {
          clientId: client.id,
          description: c.desc,
          clientName: c.name,
          hotel: "Receivables",
          debit: c.receivable,
          credit: c.name === "Mr Bilal" ? c.receivable : 0,
        },
      });
    }

    // Receivable summary for Oct period (Family package 2.7M is aggregate received)
    const totalPkg = c.payment + (c.receivable || 0);
    const received = c.payment;
    const remaining = c.receivable || 0;
    await prisma.receivable.create({
      data: {
        periodId: period.id,
        clientId: client.id,
        clientName: c.name,
        bookingDate: c.tourDate,
        tripDates: c.desc,
        totalPackage: totalPkg,
        amountToReceive: totalPkg,
        amountReceived: received,
        remainingAmount: remaining,
        status: remaining > 0 ? "Partial" : "Settled",
      },
    });
  }

  // Aggregate Family package received 2,700,000 noted on Receivables sheet
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

  console.log("Seed complete — Oct-2026 data from Excel loaded.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
