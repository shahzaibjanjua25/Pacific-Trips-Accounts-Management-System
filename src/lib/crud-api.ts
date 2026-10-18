// pacific-trips-app/src/lib/crud-api.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { getSessionUserId } from "./auth";
import { attributeSaleToSalesperson } from "./sales-attribution";
import { computeSalesPayroll } from "./payroll-service";
import { syncPayrollForEmployee, propagatePayableToOperational } from "./links-service";

type ModelName =
  | "receivable" | "payable" | "payrollEntry" | "commission"
  | "officeExpense" | "marketingExpense" | "hotelBooking" | "transportJob"
  | "refund" | "asset" | "liability" | "bankTxn" | "client" | "employee"
  | "salesPerformance" | "bankBalance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModel(name: ModelName): any {
  const map: Record<string, unknown> = {
    receivable: prisma.receivable, payable: prisma.payable, trip: prisma.trip,
    payrollEntry: prisma.payrollEntry, commission: prisma.commission,
    officeExpense: prisma.officeExpense, marketingExpense: prisma.marketingExpense,
    hotelBooking: prisma.hotelBooking, transportJob: prisma.transportJob,
    ticketing: prisma.ticketing, supplierAdvance: prisma.supplierAdvance,
    refund: prisma.refund, asset: prisma.asset, liability: prisma.liability,
    ownerTxn: prisma.ownerTxn, pettyCashTxn: prisma.pettyCashTxn,
    bankTxn: prisma.bankTxn, client: prisma.client, employee: prisma.employee,
    vadet: prisma.vadet, salesPerformance: prisma.salesPerformance,
    bankBalance: prisma.bankBalance,
  };
  return map[name];
}

const ALLOWED_FIELDS: Record<ModelName, string[]> = {
  receivable: ["periodId", "clientId", "clientName", "contact", "bookingDate", "tripDates", "destination", "totalPackage", "amountToReceive", "amountReceived", "remainingAmount", "dueDate", "daysOverdue", "tripStart", "salesperson", "discounts", "additionalCharges", "finalSettlement", "status", "notes"],
  payable: ["periodId", "supplierName", "category", "description", "invoiceRef", "originalAmount", "amountPaid", "remaining", "dueDate", "daysOverdue", "status", "relatedTrip", "notes"],
  payrollEntry: ["periodId", "employeeId", "employeeName", "basicSalary", "bonus", "taxDeducted", "loanInstallment", "otherDeductions", "netPayable", "amountPaid", "remaining", "status", "paidDate", "notes"],
  commission: ["periodId", "employeeId", "employeeName", "tripRef", "clientName", "saleAmount", "commissionRate", "commissionAmt", "status", "notes"],
  officeExpense: ["periodId", "date", "category", "description", "amount", "vendor", "paymentMethod", "receiptRef", "approvedBy", "department", "recurring", "notes"],
  marketingExpense: ["periodId", "date", "channel", "description", "amount", "vendor", "paymentMethod", "receiptRef", "notes"],
  hotelBooking: ["periodId", "hotelName", "clientName", "tripRef", "checkIn", "checkOut", "nights", "rooms", "status", "notes"],
  transportJob: ["periodId", "driverName", "vehicle", "clientName", "tripRef", "fuelCost", "status", "notes"],
  refund: ["periodId", "clientId", "clientName", "amount", "reason", "status", "paidDate", "tripRef", "notes"],
  asset: ["periodId", "assetName", "category", "purchaseDate", "purchaseCost", "currentStatus", "assignedToId", "location", "serialNo", "disposalDate", "disposalValue", "notes"],
  liability: ["periodId", "liabilityType", "partyName", "description", "originalAmount", "amountPaid", "outstanding", "dueDate", "interest", "relatedRef", "startDate", "status", "notes"],
  bankTxn: ["periodId", "accountId", "accountName", "date", "description", "deposit", "withdrawal", "transferIn", "transferOut", "bankCharges", "balance", "statementRef", "reconciled", "notes"],
  client: ["name", "contact", "phone", "email", "notes"],
  employee: ["name", "role", "basicSalary", "phone", "isActive"],
  salesPerformance: ["periodId", "employeeId", "employeeName", "tourDate", "description", "category", "subCategory", "clientName", "debit", "credit", "status", "enteredBy", "notes"],
  bankBalance: ["accountName", "balance", "asOfDate"],
};

function pickAllowed(model: ModelName, data: Record<string, unknown>) {
  const allowed = ALLOWED_FIELDS[model] ?? [];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

async function adjustBank(accountName: string | null | undefined, delta: number) {
  if (!accountName || delta === 0) return;
  const trimmed = String(accountName).trim();
  if (!trimmed) return;

  const normalized = trimmed.toLowerCase();
  const all = await prisma.bankBalance.findMany();
  const existing = all.find((b) => b.accountName.trim().toLowerCase() === normalized);

  if (existing) {
    await prisma.bankBalance.update({
      where: { id: existing.id },
      data: { balance: existing.balance + delta },
    });
  } else {
    await prisma.bankBalance.create({
      data: { accountName: trimmed, balance: Math.max(0, delta) },
    });
  }
}

// Removed the auto-math override (enrich). It now trusts exactly what you type.
function cleanData(model: ModelName, data: Record<string, unknown>) {
  const d = { ...data };
  
  for (const key of Object.keys(d)) {
    if (
      (key.toLowerCase().includes("date") || key === "checkIn" || key === "checkOut" || key === "tripStart") &&
      typeof d[key] === "string" && d[key]
    ) {
      d[key] = new Date(d[key] as string);
    } else if (typeof d[key] === "string" && d[key] === "") {
      d[key] = null;
    }
  }
  return d;
}

export function makeCrudHandlers(modelName: ModelName, opts?: { periodScoped?: boolean; orderBy?: Record<string, string> }) {
  const periodScoped = opts?.periodScoped !== false;
  const orderBy = opts?.orderBy || { createdAt: "desc" };

  async function GET(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const model = getModel(modelName);
    const periodId = req.nextUrl.searchParams.get("periodId");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = periodScoped && periodId ? { periodId } : {};
    const rows = await model.findMany({ where, orderBy });
    return NextResponse.json(rows);
  }

  async function handleReceivableBankChange(
    oldReceived: number, newReceived: number, salesperson: string | null | undefined,
    periodId: string, clientName: string, newTotalPackage: number, oldTotalPackage: number
  ) {
    const delta = newReceived - oldReceived;
    if (delta !== 0) {
      const lastTxn = await prisma.transaction.findFirst({
        where: { periodId, OR: [{ party: clientName }, { subCategory: clientName }], bankAccount: { not: null } },
        orderBy: { date: "desc" },
      });
      if (lastTxn?.bankAccount) await adjustBank(lastTxn.bankAccount, delta);
    }

    const prevPackage = oldTotalPackage;
    const nextPackage = newTotalPackage;

    if (salesperson && nextPackage > 0) {
      const existingSale = await prisma.salesPerformance.findFirst({
        where: { periodId, clientName, employeeName: salesperson },
      });

      if (!existingSale) {
        await attributeSaleToSalesperson({
          periodId, salesperson, clientName, amount: nextPackage,
          description: `Sale to ${clientName} (from Receivables)`,
        });
      } else {
        const deltaPackage = Math.max(0, nextPackage - prevPackage);
        if (deltaPackage > 0) {
          await attributeSaleToSalesperson({
            periodId, salesperson, clientName, amount: deltaPackage,
            description: `Package increase: ${clientName}`,
          });
        } else if (nextPackage < prevPackage) {
          const reduction = prevPackage - nextPackage;
          const currentTotal = existingSale.debit || 0;
          const newTotal = Math.max(0, currentTotal - reduction);
          await prisma.salesPerformance.update({
            where: { id: existingSale.id }, data: { debit: newTotal },
          });
          await computeSalesPayroll(periodId);
          await syncPayrollForEmployee(periodId, salesperson);
        }
      }
    } else if (!salesperson) {
      const existingSales = await prisma.salesPerformance.findMany({ where: { periodId, clientName } });
      for (const s of existingSales) {
        await prisma.salesPerformance.delete({ where: { id: s.id } });
        await computeSalesPayroll(periodId);
        await syncPayrollForEmployee(periodId, s.employeeName);
      }
    }
  }

  async function POST(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const model = getModel(modelName);
      const body = await req.json();
      const cleaned = pickAllowed(modelName, body);
      let data = cleanData(modelName, cleaned);
      delete data.id;
      delete data.team;
      if (!periodScoped) delete data.periodId;
      
      const pid = (data.periodId as string) || body.periodId || null;
      const row = await model.create({ data });

      if (modelName === "receivable" && pid) {
        const r = row as { clientName: string; salesperson: string | null; totalPackage: number; };
        if (r.salesperson && r.totalPackage > 0) {
          await attributeSaleToSalesperson({
            periodId: pid, salesperson: r.salesperson, clientName: r.clientName,
            amount: r.totalPackage, description: `Sale to ${r.clientName} (from Receivables)`,
          });
        }
      }
      return NextResponse.json(row);
    } catch (e) {
      console.error(`[crud:${modelName}:POST]`, e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  async function PUT(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const model = getModel(modelName);
      const body = await req.json();
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const id = body.id as string;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const oldRecord: any = await model.findUnique({ where: { id } });
      if (!oldRecord) return NextResponse.json({ error: "Record not found" }, { status: 404 });

      const cleaned = pickAllowed(modelName, body);
      let data = cleanData(modelName, cleaned);
      delete data.id;
      delete data.team;
      delete data.createdAt;
      delete data.updatedAt;
      const pid = body.periodId || null;
      delete data.periodId;
      
      const row = await model.update({ where: { id }, data });

      if (modelName === "receivable" && oldRecord.periodId) {
        const oldReceived = oldRecord.amountReceived || 0;
        const newReceived = (row as { amountReceived: number }).amountReceived || 0;
        const oldPackage = oldRecord.totalPackage || 0;
        const newPackage = (row as { totalPackage: number }).totalPackage || 0;
        const oldSalesperson = oldRecord.salesperson || null;
        const newSalesperson = (row as { salesperson: string | null }).salesperson || null;
        const clientName = (row as { clientName: string }).clientName;

        await handleReceivableBankChange(
          oldReceived, newReceived, newSalesperson, oldRecord.periodId, clientName, newPackage, oldPackage
        );

        if (oldSalesperson && oldSalesperson !== newSalesperson) {
          const oldSales = await prisma.salesPerformance.findMany({
            where: { periodId: oldRecord.periodId, clientName, employeeName: oldSalesperson },
          });
          for (const s of oldSales) await prisma.salesPerformance.delete({ where: { id: s.id } });
          await computeSalesPayroll(oldRecord.periodId);
          await syncPayrollForEmployee(oldRecord.periodId, oldSalesperson);
        }

        if (newSalesperson && newSalesperson !== oldSalesperson && newPackage > 0) {
          await attributeSaleToSalesperson({
            periodId: oldRecord.periodId, salesperson: newSalesperson, clientName,
            amount: newPackage, description: `Reassigned sale: ${clientName}`,
          });
        }
      }

      if (modelName === "payable" && oldRecord.periodId) {
        const oldPaid = oldRecord.amountPaid || 0;
        const newPaid = (row as { amountPaid: number }).amountPaid || 0;
        const delta = newPaid - oldPaid;
        if (delta !== 0) {
          const supplierName = (row as { supplierName: string }).supplierName;
          const lastTxn = await prisma.transaction.findFirst({
            where: { periodId: oldRecord.periodId, OR: [{ party: supplierName }, { subCategory: supplierName }], bankAccount: { not: null } },
            orderBy: { date: "desc" },
          });
          if (lastTxn?.bankAccount) await adjustBank(lastTxn.bankAccount, -delta);
        }
        await propagatePayableToOperational(id);
      }

      return NextResponse.json(row);
    } catch (e) {
      console.error(`[crud:${modelName}:PUT]`, e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  async function DELETE(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const model = getModel(modelName);
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

      if (modelName === "payrollEntry") {
        await prisma.transactionLink.deleteMany({ where: { entityType: "payroll", entityId: id } });
      }

      await model.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error(`[crud:${modelName}:DELETE]`, e);
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  return { GET, POST, PUT, DELETE };
}