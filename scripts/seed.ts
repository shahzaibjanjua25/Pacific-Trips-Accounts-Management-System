/**
 * Seed Pacific Trips DB with October 2026 data extracted from the Excel workbooks.
 * Run: npx tsx scripts/seed.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Pacific Trips Accounting System…");

  // Period Oct-2026
  const period = await prisma.period.upsert({
    where: { year_month: { year: 2026, month: 10 } },
    update: {},
    create: { year: 2026, month: 10, label: "Oct-2026" },
  });
  console.log("Period:", period.label);

  // Bank balances (from Dashboard / Bank sheet)
  const banks = [
    { accountName: "HBL Main", balance: 0 },
    { accountName: "Meezan / Faisal", balance: 370000 },
    { accountName: "Easypaisa", balance: 282 },
    { accountName: "Jazzcash", balance: 10472 },
  ];
  for (const b of banks) {
    await prisma.bankBalance.upsert({
      where: { id: b.accountName }, // will fail if no unique; use createMany skipDuplicates style
      update: { balance: b.balance },
      create: { id: b.accountName, accountName: b.accountName, balance: b.balance },
    }).catch(async () => {
      await prisma.bankBalance.create({ data: { accountName: b.accountName, balance: b.balance } });
    });
  }

  // Clients
  const clientsData = [
    { name: "Mr Haris", phone: "3150104572" },
    { name: "Mr Bilal", phone: "3129845210" },
    { name: "Dr Ali" },
    { name: "Mr Moiz" },
    { name: "Mr Shahid" },
    { name: "Mr Zeeshan" },
    { name: "Ms Aiman" },
    { name: "Family" },
  ];
  for (const c of clientsData) {
    await prisma.client.upsert({
      where: { id: c.name },
      update: {},
      create: { id: c.name, name: c.name, phone: c.phone ?? null },
    }).catch(async () => {
      const existing = await prisma.client.findFirst({ where: { name: c.name } });
      if (!existing) await prisma.client.create({ data: { name: c.name, phone: c.phone ?? null } });
    });
  }

  // Employees / Sales team
  const employees = [
    { name: "Amad Amjad", role: "Sales", basicSalary: 0 },
    { name: "Mr Ahsaan", role: "Sales", basicSalary: 0 },
    { name: "Maira", role: "Sales", basicSalary: 0 },
    { name: "Zunaira", role: "Sales", basicSalary: 0 },
    { name: "Awais", role: "Sales", basicSalary: 0 },
    { name: "Malika", role: "Sales", basicSalary: 0 },
    { name: "Talha", role: "Sales", basicSalary: 0 },
    { name: "Naimal", role: "Sales", basicSalary: 0 },
    { name: "Ashir", role: "Sales", basicSalary: 0 },
    { name: "Izza", role: "Sales", basicSalary: 0 },
    { name: "Abdullah", role: "Staff", basicSalary: 0 },
    { name: "Kamran", role: "Staff", basicSalary: 0 },
  ];
  for (const e of employees) {
    const exists = await prisma.employee.findFirst({ where: { name: e.name } });
    if (!exists) await prisma.employee.create({ data: e });
  }

  // Employee loans / Vadets (from Vadets sheet + Dashboard)
  const vadets = [
    { name: "Sheeraz", amount: 494000 },
    { name: "sahmi", amount: 630000 },
    { name: "driver", amount: 85000 },
    { name: "sohaib", amount: 30000 },
    { name: "sumair", amount: 8000 },
  ];
  for (const v of vadets) {
    await prisma.vadet.create({
      data: { periodId: period.id, name: v.name, amount: v.amount },
    });
  }

  // Office expenses (from Office Exp sheet)
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
      data: { periodId: period.id, category: o.category, amount: o.amount, recurring: true },
    });
  }

  // Marketing
  await prisma.marketingExpense.create({
    data: { periodId: period.id, channel: "Monthly Ads", amount: 300000, description: "Monthly marketing spend" },
  });

  // Payroll (approx from Dashboard: Basic 600000, Net 543000)
  await prisma.payrollEntry.create({
    data: {
      periodId: period.id,
      employeeName: "Team Salaries (combined)",
      basicSalary: 600000,
      loanInstallment: 70000,
      netPayable: 543000,
      status: "Pending",
    },
  });

  // Assets (from Assets sheet)
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
    await prisma.asset.create({ data: { ...a, periodId: period.id } });
  }

  // Receivables / Client packages (from Client Data + Receivables)
  // Mr Haris: Payment 169000, costs ~156080, balance 12920
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Mr Haris",
      contact: "3150104572",
      bookingDate: new Date("2026-10-05"),
      tripDates: "5 days, Skardu By Air",
      destination: "Skardu",
      totalPackage: 169000,
      amountToReceive: 169000,
      amountReceived: 169000,
      remainingAmount: 0,
      status: "Settled",
      salesperson: null,
    },
  });

  // Mr Bilal
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Mr Bilal",
      contact: "3129845210",
      bookingDate: new Date("2026-10-17"),
      tripDates: "8 Days, Hunza Skardu Trip By Road",
      destination: "Hunza / Skardu",
      totalPackage: 650000,
      amountToReceive: 650000,
      amountReceived: 320000,
      remainingAmount: 330000,
      status: "Partial",
    },
  });

  // Dr Ali
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Dr Ali",
      bookingDate: new Date("2026-10-11"),
      tripDates: "5 days, Skardu By Air",
      destination: "Skardu",
      totalPackage: 349000,
      amountToReceive: 349000,
      amountReceived: 260000,
      remainingAmount: 89000,
      status: "Partial",
    },
  });

  // Mr Moiz
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Mr Moiz",
      bookingDate: new Date("2026-11-01"),
      tripDates: "6 days, Skardu By Air",
      destination: "Skardu",
      totalPackage: 200000,
      amountToReceive: 200000,
      amountReceived: 10000,
      remainingAmount: 190000,
      status: "Partial",
    },
  });

  // Mr Shahid
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Mr Shahid",
      bookingDate: new Date("2026-11-20"),
      tripDates: "6 days, Skardu By Air",
      destination: "Skardu",
      totalPackage: 420000,
      amountToReceive: 420000,
      amountReceived: 140000,
      remainingAmount: 280000,
      status: "Partial",
    },
  });

  // Mr Zeeshan
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Mr Zeeshan",
      bookingDate: new Date("2027-05-03"),
      tripDates: "6 days, Skardu By Road",
      destination: "Skardu",
      totalPackage: 238000,
      amountToReceive: 238000,
      amountReceived: 10000,
      remainingAmount: 228000,
      status: "Partial",
    },
  });

  // Ms Aiman
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Ms Aiman",
      bookingDate: new Date("2026-10-18"),
      tripDates: "5 days, Skardu By Air",
      destination: "Skardu",
      totalPackage: 245000,
      amountToReceive: 245000,
      amountReceived: 10000,
      remainingAmount: 235000,
      status: "Partial",
    },
  });

  // Family (from Receivables sheet - 2700000 received)
  await prisma.receivable.create({
    data: {
      periodId: period.id,
      clientName: "Family",
      totalPackage: 2700000,
      amountToReceive: 2700000,
      amountReceived: 2700000,
      remainingAmount: 0,
      status: "Settled",
    },
  });

  // Supplier payables remaining (from Dashboard: 2333360)
  await prisma.payable.create({
    data: {
      periodId: period.id,
      supplierName: "Various Suppliers (combined)",
      category: "Other",
      originalAmount: 2333360,
      amountPaid: 0,
      remaining: 2333360,
      status: "Open",
      description: "Imported from Excel Dashboard",
    },
  });

  // Sample Trip PnL for Mr Haris
  await prisma.trip.create({
    data: {
      periodId: period.id,
      clientName: "Mr Haris",
      destination: "Skardu",
      startDate: new Date("2026-10-05"),
      packageRevenue: 169000,
      hotelCost: 34650 + 41930 + 9500,
      transportCost: 70000,
      totalDirectCost: 156080,
      grossProfit: 169000 - 156080,
      netProfit: 169000 - 156080,
      status: "Completed",
    },
  });

  // Employee loans with named installments
  // Ahsaan 30k/mo, Amjad 20k/mo, Awais 20k/mo
  const empList = await prisma.employee.findMany();
  const loanDefs: { match: string; original: number; remaining: number; installment: number }[] = [
    { match: "ahsaan", original: 400000, remaining: 400000, installment: 30000 },
    { match: "amad", original: 300000, remaining: 300000, installment: 20000 },
    { match: "awais", original: 240000, remaining: 240000, installment: 20000 },
  ];
  for (const def of loanDefs) {
    const emp = empList.find((e) => e.name.toLowerCase().includes(def.match));
    if (emp) {
      await prisma.employeeLoan.create({
        data: {
          employeeId: emp.id,
          originalAmount: def.original,
          remainingAmount: def.remaining,
          monthlyInstallment: def.installment,
          notes: `Monthly installment ${def.installment}`,
        },
      });
    }
  }

  console.log("✅ Seed complete. Open the app and select Oct-2026 period.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
