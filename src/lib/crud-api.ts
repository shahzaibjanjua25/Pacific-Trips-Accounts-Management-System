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

  if (model === "hotelBooking") {
    const orig = Number(d.agreedCost) || 0;
    const paid = Number(d.amountPaid) || 0;
    d.remaining = Math.max(0, orig - paid);
    if (d.remaining === 0) d.status = "Paid";
    else if ((paid as number) > 0) d.status = "Partial";
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
    d.netPayable = Math.max(0, basic + bonus - tax - loan - other);
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

  if (model === "transportJob") {
    const agreed = Number(d.agreedCost) || 0;
    const settled = Number(d.finalSettlement) || 0;
    d.remaining = Math.max(0, agreed - settled);
    if (d.remaining === 0) d.status = "Settled";
    else if ((settled as number) > 0) d.status = "Partial";
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

  async function POST(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const model = getModel(modelName);
      const body = await req.json();
      const data = enrich(modelName, body);
      delete data.id;
      delete data.team;
      const row = await model.create({ data });
      return NextResponse.json(row);
    } catch (e) {
      console.error(`[crud:${modelName}:POST]`, e);
      return NextResponse.json({ error: "Create failed" }, { status: 500 });
    }
  }

  async function PUT(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const model = getModel(modelName);
      const body = await req.json();
      if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const data = enrich(modelName, body);
      const id = data.id as string;
      delete data.id;
      delete data.team;
      delete data.createdAt;
      delete data.updatedAt;
      delete data.periodId; // never move a record across periods on edit
      const row = await model.update({ where: { id }, data });
      return NextResponse.json(row);
    } catch (e) {
      console.error(`[crud:${modelName}:PUT]`, e);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }
  }

  async function DELETE(req: NextRequest) {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
      const model = getModel(modelName);
      const id = req.nextUrl.searchParams.get("id");
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      await model.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    } catch (e) {
      console.error(`[crud:${modelName}:DELETE]`, e);
      return NextResponse.json({ error: "Delete failed" }, { status: 500 });
    }
  }

  return { GET, POST, PUT, DELETE };
}