import { prisma } from "./prisma";

/** Optional synthetic demo data for an empty development database. */
export async function runSeed(force = false) {
  return prisma.$transaction(async (db) => {
    const existing = await db.period.count();
    if (existing > 0 && !force) {
      return { ok: false, message: "Database already has accounting months. Use force to replace its data with demo records." };
    }
    if (force) {
      await db.$executeRawUnsafe(`
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
    }
    const period = await db.period.create({ data: { year: 2026, month: 1, label: "Jan-2026" } });
    await db.employee.create({ data: { name: "Demo Employee", role: "Sales", basicSalary: 1000 } });
    const client = await db.client.create({ data: { name: "Demo Client", notes: "Synthetic demonstration record" } });
    await db.receivable.create({ data: {
      periodId: period.id, clientId: client.id, clientName: client.name,
      totalPackage: 100, amountToReceive: 100, remainingAmount: 100,
      bankAccount: "Demo Account", status: "Open",
    } });
    await db.bankAccount.create({ data: { name: "Demo Account" } });
    await db.bankBalance.create({ data: { accountName: "Demo Account", balance: 0 } });
    return {
      ok: true, message: "Synthetic demo data created.",
      counts: { periods: 1, employees: 1, clients: 1, receivables: 1, banks: 1 },
    };
  }, { isolationLevel: "Serializable", timeout: 30_000 });
}
