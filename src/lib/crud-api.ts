import { NextRequest, NextResponse } from "next/server";
import { prisma } from "./prisma";
import { getSessionUserId } from "./auth";
import { calcOverdue } from "./utils";

type ModelName =
  | "receivable"
  | "payable"
  | "trip"
  | "payrollEntry"
  | "commission"
  | "officeExpense"
  | "marketingExpense"
  | "hotelBooking"
  | "transportJob"
  | "ticketing"
  | "supplierAdvance"
  | "refund"
  | "asset"
  | "liability"
  | "ownerTxn"
  | "pettyCashTxn"
  | "bankTxn"
  | "client"
  | "employee"
  | "vadet"
  | "salesPerformance"
  | "bankBalance";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getModel(name: ModelName): any {
  const map: Record<string, unknown> = {
    receivable: prisma.receivable,
    payable: prisma.payable,
    trip: prisma.trip,
    payrollEntry: prisma.payrollEntry,
    commission: prisma.commission,
    officeExpense: prisma.officeExpense,
    marketingExpense: prisma.marketingExpense,
    hotelBooking: prisma.hotelBooking,
    transportJob: prisma.transportJob,
    ticketing: prisma.ticketing,
    supplierAdvance: prisma.supplierAdvance,
    refund: prisma.refund,
    asset: prisma.asset,
    liability: prisma.liability,
    ownerTxn: prisma.ownerTxn,
    pettyCashTxn: prisma.pettyCashTxn,
    bankTxn: prisma.bankTxn,
    client: prisma.client,
    employee: prisma.employee,
    vadet: prisma.vadet,
    salesPerformance: prisma.salesPerformance,
    bankBalance: prisma.bankBalance,
  };
  return map[name];
}
// Add this near the top of crud-api.ts, after `getModel`

const ALLOWED_FIELDS: Record<ModelName, string[]> = {
  receivable: [
    "periodId", "clientId", "clientName", "contact", "bookingDate", "tripDates",
    "destination", "totalPackage", "amountToReceive", "amountReceived",
    "remainingAmount", "dueDate", "daysOverdue", "tripStart", "salesperson",
    "discounts", "additionalCharges", "finalSettlement", "status", "notes",
  ],
  payable: [
    "periodId", "supplierName", "category", "description", "invoiceRef",
    "originalAmount", "amountPaid", "remaining", "dueDate", "daysOverdue",
    "status", "relatedTrip", "notes",
  ],
  trip: [
    "periodId", "clientId", "clientName", "tripRef", "destination", "startDate",
    "endDate", "packageRevenue", "hotelCost", "transportCost", "ticketingCost",
    "otherDirectCost", "totalDirectCost", "grossProfit", "overheadAlloc",
    "netProfit", "status", "salesperson", "notes",
  ],
  payrollEntry: [
    "periodId", "employeeId", "employeeName", "basicSalary", "bonus",
    "taxDeducted", "loanInstallment", "otherDeductions", "netPayable",
    "amountPaid", "remaining", "status", "paidDate", "notes",
  ],
  commission: [
    "periodId", "employeeId", "employeeName", "tripRef", "clientName",
    "saleAmount", "commissionRate", "commissionAmt", "status", "notes",
  ],
  officeExpense: [
    "periodId", "date", "category", "description", "amount", "vendor",
    "paymentMethod", "receiptRef", "approvedBy", "department", "recurring", "notes",
  ],
  marketingExpense: [
    "periodId", "date", "channel", "description", "amount", "vendor",
    "paymentMethod", "receiptRef", "notes",
  ],
  hotelBooking: [
    "periodId", "hotelName", "clientName", "tripRef", "checkIn", "checkOut",
    "nights", "rooms", "status", "notes",
  ],
  transportJob: [
    "periodId", "driverName", "vehicle", "clientName", "tripRef", "fuelCost",
    "status", "notes",
  ],
  ticketing: [
    "periodId", "airline", "clientName", "tripRef", "ticketCost",
    "chargedToClient", "profit", "status", "notes",
  ],
  supplierAdvance: [
    "periodId", "supplierName", "amount", "adjustedAmount", "remaining",
    "relatedTrip", "dateGiven", "notes",
  ],
  refund: [
    "periodId", "clientId", "clientName", "amount", "reason", "status",
    "paidDate", "tripRef", "notes",
  ],
  asset: [
    "periodId", "assetName", "category", "purchaseDate", "purchaseCost",
    "currentStatus", "assignedToId", "location", "serialNo", "disposalDate",
    "disposalValue", "notes",
  ],
  liability: [
    "periodId", "liabilityType", "partyName", "description", "originalAmount",
    "amountPaid", "outstanding", "dueDate", "interest", "relatedRef",
    "startDate", "status", "notes",
  ],
  ownerTxn: [
    "periodId", "date", "type", "description", "amountIn", "amountOut",
    "runningBalance", "mode", "recordedBy", "supportingDoc", "notes",
  ],
  pettyCashTxn: [
    "periodId", "date", "description", "personReceiving", "amountOut",
    "amountIn", "purpose", "receiptRef", "balanceAfter", "approvedBy", "notes",
  ],
  bankTxn: [
    "periodId", "accountId", "accountName", "date", "description", "deposit",
    "withdrawal", "transferIn", "transferOut", "bankCharges", "balance",
    "statementRef", "reconciled", "notes",
  ],
  client: ["name", "contact", "phone", "email", "notes"],
  employee: ["name", "role", "basicSalary", "phone", "isActive"],
  vadet: ["periodId", "name", "amount", "notes"],
  salesPerformance: [
    "periodId", "employeeId", "employeeName", "tourDate", "description",
    "category", "subCategory", "clientName", "debit", "credit", "status",
    "enteredBy", "notes",
  ],
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
function enrich(model: ModelName, data: Record<string, unknown>) {
  const d = { ...data };

  if (model === "receivable") {
    const total = Number(d.totalPackage) || 0;
    const received = Number(d.amountReceived) || 0;
    const discounts = Number(d.discounts) || 0;
    const additional = Number(d.additionalCharges) || 0;
    d.amountToReceive = Math.max(0, total + additional - discounts);
    d.remainingAmount = Math.max(0, (d.amountToReceive as number) - received);
    if (d.remainingAmount === 0) d.status = "Settled";
    else if (received > 0) d.status = d.status === "Overdue" ? "Overdue" : "Partial";
    else d.status = d.status || "Open";
    const dueDate = d.dueDate ? new Date(d.dueDate as string) : null;
    d.daysOverdue = calcOverdue(dueDate);
    if ((d.daysOverdue as number) > 0 && (d.remainingAmount as number) > 0) {
      d.status = "Overdue";
    }
  }

  if (model === "payable") {
    const orig = Number(d.originalAmount) || 0;
    const paid = Number(d.amountPaid) || 0;
    d.remaining = Math.max(0, orig - paid);
    const due = d.dueDate ? new Date(d.dueDate as string) : null;
    d.daysOverdue = calcOverdue(due);
    if ((d.remaining as number) === 0) d.status = "Paid";
    else if ((d.daysOverdue as number) > 0) d.status = "Overdue";
    else if (paid > 0) d.status = "Partial";
    else d.status = d.status || "Open";
  }

  // HotelBooking has no money fields - those live on Payable.
  // Do NOT inject agreedCost / amountPaid / remaining here (Prisma will reject them).
  if (model === "hotelBooking") {
    // status only; leave as client provided
  }

  if (model === "trip") {
    const rev = Number(d.packageRevenue) || 0;
    const hotel = Number(d.hotelCost) || 0;
    const transport = Number(d.transportCost) || 0;
    const ticket = Number(d.ticketingCost) || 0;
    const other = Number(d.otherDirectCost) || 0;
    d.totalDirectCost = hotel + transport + ticket + other;
    d.grossProfit = rev - (d.totalDirectCost as number);
    d.netProfit = (d.grossProfit as number) - (Number(d.overheadAlloc) || 0);
  }

  if (model === "ticketing") {
    const cost = Number(d.ticketCost) || 0;
    const charged = Number(d.chargedToClient) || 0;
    d.profit = charged - cost;
  }

  if (model === "supplierAdvance") {
    const amt = Number(d.amount) || 0;
    const adj = Number(d.adjustedAmount) || 0;
    d.remaining = Math.max(0, amt - adj);
  }

  if (model === "payrollEntry") {
    const basic = Number(d.basicSalary) || 0;
    const bonus = Number(d.bonus) || 0;
    const tax = Number(d.taxDeducted) || 0;
    const loan = Number(d.loanInstallment) || 0;
    const other = Number(d.otherDeductions) || 0;
    const paid = Number(d.amountPaid) || 0;
    // Keep client-supplied netPayable when present (includes commission from page).
    // Only recompute from components when netPayable was omitted.
    if (d.netPayable == null || d.netPayable === "") {
      d.netPayable = Math.max(0, basic + bonus - tax - loan - other);
    } else {
      d.netPayable = Number(d.netPayable) || 0;
    }
    d.remaining = Math.max(0, (d.netPayable as number) - paid);
    if ((d.remaining as number) === 0 && paid > 0) d.status = "Paid";
    else if (paid > 0) d.status = "Partial";
    else d.status = d.status || "Pending";
  }

  if (model === "liability") {
    const orig = Number(d.originalAmount) || 0;
    const paid = Number(d.amountPaid) || 0;
    d.outstanding = Math.max(0, orig - paid);
    if (d.outstanding === 0) d.status = "Paid";
  }

  // TransportJob has no remaining/agreedCost - money lives on Payable.
  if (model === "transportJob") {
    // status only
  }

  for (const key of Object.keys(d)) {
    if (
      (key.toLowerCase().includes("date") ||
        key === "checkIn" ||
        key === "checkOut" ||
        key === "tripStart") &&
      typeof d[key] === "string" &&
      d[key]
    ) {
      d[key] = new Date(d[key] as string);
    } else if (typeof d[key] === "string" && d[key] === "") {
      d[key] = null;
    }
  }

  return d;
}

export function makeCrudHandlers(
  modelName: ModelName,
  opts?: { periodScoped?: boolean; orderBy?: Record<string, string> }
) {
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

  async function applyPettyCashBalance(
    data: Record<string, unknown>,
    periodId: string | null | undefined,
    excludeId?: string
  ) {
    if (modelName !== "pettyCashTxn") return data;
    const amountOut = Number(data.amountOut) || 0;
    const amountIn = Number(data.amountIn) || 0;
    // Latest prior balance in this period (exclude self on update)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = periodId ? { periodId } : {};
    if (excludeId) where.id = { not: excludeId };
    const prev = await prisma.pettyCashTxn.findFirst({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const prevBal = prev?.balanceAfter ?? 0;
    data.balanceAfter = prevBal + amountIn - amountOut;
    return data;
  }

  async function applyOwnerRunningBalance(
    data: Record<string, unknown>,
    periodId: string | null | undefined,
    excludeId?: string
  ) {
    if (modelName !== "ownerTxn") return data;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = periodId ? { periodId } : {};
    if (excludeId) where.id = { not: excludeId };
    const prev = await prisma.ownerTxn.findFirst({
      where,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    });
    const prevBal = prev?.runningBalance ?? 0;
    const amountIn = Number(data.amountIn) || 0;
    const amountOut = Number(data.amountOut) || 0;
    data.runningBalance = prevBal + amountIn - amountOut;
    return data;
  }

  async function POST(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const model = getModel(modelName);
      const body = await req.json();
      const cleaned = pickAllowed(modelName, body);
      let data = enrich(modelName, cleaned);
      delete data.id;
      delete data.team;
      if (!periodScoped) {
        delete data.periodId;
      }
      const pid = (data.periodId as string) || body.periodId || null;
      data = await applyPettyCashBalance(data, pid);
      data = await applyOwnerRunningBalance(data, pid);
      const row = await model.create({ data });
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
      const cleaned = pickAllowed(modelName, body);
      let data = enrich(modelName, cleaned);
      const id = (data.id as string) || body.id;
      delete data.id;
      delete data.team;
      delete data.createdAt;
      delete data.updatedAt;
      const pid = body.periodId || null;
      delete data.periodId;
      data = await applyPettyCashBalance(data, pid, id);
      data = await applyOwnerRunningBalance(data, pid, id);
      const row = await model.update({ where: { id }, data });
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

      // Cascade delete transaction links for payroll entries
      if (modelName === "payrollEntry") {
        await prisma.transactionLink.deleteMany({
          where: { entityType: "payroll", entityId: id },
        });
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
