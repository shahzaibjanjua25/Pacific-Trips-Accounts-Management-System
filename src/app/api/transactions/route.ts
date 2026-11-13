import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  postTransaction,
  runTransactionMutation,
  StaleTransactionError,
  TransactionInputError,
  isCompletedStatus,
  deleteTransaction,
  updateTransaction,
} from "@/lib/transaction-service";
import { isClientReceiptCategory, transactionCategoryBehavior, isStandalonePaymentCategory } from "@/lib/transaction-categories";
import { clientReceiptGroups, withReceiptPaymentStatus } from "@/lib/client-receipts";

export async function GET(req: NextRequest) {
  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) return NextResponse.json([]);
  const txns = await prisma.transaction.findMany({
    where: { periodId },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(withReceiptPaymentStatus(txns, await clientReceiptGroups(periodId)));
}

function isDrawingCategory(category: string): boolean {
  const c = (category || "").toLowerCase().trim();
  return (
    c.includes("owner drawing") ||
    c.includes("personal expense") ||
    c === "drawing" ||
    c.includes("owner personal")
  );
}

function isAssetCategory(category: string): boolean {
  return (category || "").toLowerCase().includes("asset");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const debit = parseAmount(body.debit) ?? 0;
    const credit = parseAmount(body.credit) ?? 0;
    const isNewClient = !!body.isNewClient;

    const input = {
      periodId: body.periodId,
      date: body.date,
      description: body.description,
      category: body.category || "Expense",
      subCategory: body.subCategory,
      party: body.party,
      tripRef: body.tripRef,
      debit,
      credit,
      paymentMethod: body.paymentMethod,
      bankAccount: body.bankAccount,
      status: isClientReceiptCategory(body.category) ? "Completed" : body.status || "Completed",
      enteredBy: body.enteredBy,
      notes: body.notes,
      relatedReceivableId: body.relatedReceivableId,
      relatedPayableId: body.relatedPayableId,
      relatedPayrollId: body.relatedPayrollId,
      relatedRefundId: body.relatedRefundId,
      relatedHotelId: body.relatedHotelId,
      relatedTransportId: body.relatedTransportId,
      relatedCommissionId: body.relatedCommissionId,
      relatedAdvanceId: body.relatedAdvanceId,
      clientTotalPackage: parseAmount(body.clientTotalPackage),
      clientAmountPaid: parseAmount(body.clientAmountPaid),
      hotelAgreedCost: parseAmount(body.hotelAgreedCost),
      transportAgreedCost: parseAmount(body.transportAgreedCost),
      clientPhone: body.clientPhone || null,
      clientContact: body.clientContact || null,
      clientEmail: body.clientEmail || null,
      clientNotes: body.clientNotes || null,
      isNewClient,
      salesperson: body.salesperson || null,
      assetCategory: body.assetCategory || null,
    };
    const txn = await runTransactionMutation(async (db) => {
      await validateTransaction(input, db);
      return postTransaction(input, db);
    });
    return NextResponse.json(txn);
  } catch (e) {
    return mutationError(e);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (body.date != null && !Number.isFinite(new Date(body.date).getTime())) {
      throw new TransactionValidationError("Enter a valid date.");
    }
    const txn = await updateTransaction(body.id, {
      date: body.date,
      description: body.description,
      category: body.category,
      subCategory: body.subCategory,
      party: body.party,
      tripRef: body.tripRef,
      debit: parseAmount(body.debit),
      credit: parseAmount(body.credit),
      paymentMethod: body.paymentMethod,
      bankAccount: body.bankAccount,
      status: body.status,
      enteredBy: body.enteredBy,
      notes: body.notes,
      clientTotalPackage: parseAmount(body.clientTotalPackage),
      hotelAgreedCost: parseAmount(body.hotelAgreedCost),
      transportAgreedCost: parseAmount(body.transportAgreedCost),
      salesperson: body.salesperson || null,
      assetCategory: body.assetCategory || null,
    }, { expectedUpdatedAt: body.expectedUpdatedAt, validate: validateTransaction });
    if (!txn) return NextResponse.json({ error: "Transaction no longer exists." }, { status: 404 });
    return NextResponse.json(txn);
  } catch (e) {
    return mutationError(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (!(await deleteTransaction(id))) {
      return NextResponse.json({ error: "Transaction no longer exists." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return mutationError(e);
  }
}

class TransactionValidationError extends Error {}

function parseAmount(value: unknown) {
  if (value == null) return undefined;
  const amount = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(amount) || amount < 0) {
    throw new TransactionValidationError("Enter a valid, non-negative amount.");
  }
  return amount;
}

function mutationError(error: unknown) {
  if (error instanceof StaleTransactionError) {
    return NextResponse.json({ error: "This transaction changed while you were editing. Refresh and reopen it before saving." }, { status: 409 });
  }
  if (error instanceof TransactionValidationError || error instanceof TransactionInputError ||
      (error instanceof Error && error.message.startsWith("Overpayment blocked:"))) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
    return NextResponse.json({ error: "Another transaction changed these balances. Please try saving again." }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "Could not save this change. Your balances were not changed." }, { status: 500 });
}

async function validateTransaction(
  input: Parameters<typeof postTransaction>[0],
  db: Prisma.TransactionClient,
) {
  const debit = input.debit ?? 0;
  const credit = input.credit ?? 0;
  const category = transactionCategoryBehavior(input.category).toLowerCase();
  const party = (input.party || input.subCategory || "").trim();

  if (!input.periodId || !input.date || !Number.isFinite(new Date(input.date).getTime()) || !input.description?.trim()) {
    throw new TransactionValidationError("Enter a valid date and description.");
  }
  if ((debit > 0) === (credit > 0)) {
    throw new TransactionValidationError("Enter a positive amount in either Debit or Credit.");
  }
  if (isStandalonePaymentCategory(input.category) && (debit > 0 || !input.bankAccount?.trim())) {
    throw new TransactionValidationError("Choose an account and enter the payment in Credit (money out).");
  }
  if (category.includes("bank transfer")) {
    const from = input.bankAccount?.trim();
    if (!from || !party || from.toLowerCase() === party.toLowerCase()) {
      throw new TransactionValidationError("Choose two different accounts for the bank transfer.");
    }
    return;
  }
  if (!isCompletedStatus(input.status) || !party || input.isNewClient ||
      isDrawingCategory(category) || isAssetCategory(category)) return;
  const moving = /receipt|revenue|employee loan|staff advance/.test(category) ? debit : credit;
  if (!moving) return;
  const outstanding = await lookupOutstanding(input.periodId, category, party, input, db);
  if (outstanding != null && moving > outstanding) {
    throw new TransactionValidationError(
      `Overpayment blocked: ${party} has ${outstanding.toLocaleString("en-PK")} PKR outstanding. Enter that amount or less.`
    );
  }
}

async function lookupOutstanding(
  periodId: string,
  category: string,
  party: string,
  opts: { clientTotalPackage?: number; hotelAgreedCost?: number; transportAgreedCost?: number },
  db: Prisma.TransactionClient
): Promise<number | null> {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  const nameMatch = (a: string, b: string) => {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  };

  const lastNameMatch = (a: string, b: string) => {
    const aParts = norm(a).split(" ");
    const bParts = norm(b).split(" ");
    const lastA = aParts[aParts.length - 1];
    const lastB = bParts[bParts.length - 1];
    return !!lastA && lastA === lastB && lastA.length > 2;
  };

  const find = <T extends { [k: string]: unknown }>(
    rows: T[],
    key: keyof T
  ): T | undefined =>
    rows.find((r) => nameMatch(String(r[key]), party)) ??
    rows.find((r) => lastNameMatch(String(r[key]), party));

  if (
    category.includes("receipt") ||
    category.includes("revenue") ||
    category.includes("client receipt")
  ) {
    const rows = await db.receivable.findMany({
      where: { periodId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const matching = rows.filter((row) => norm(row.clientName) === norm(party));
    const r = matching.find((row) => row.remainingAmount > 0) ?? matching[0];
    return Math.max(0, Math.max(r?.totalPackage ?? 0, opts.clientTotalPackage ?? 0) - (r?.amountReceived ?? 0));
  }

  if (category.includes("salary") || category.includes("payroll")) {
    const rows = await db.payrollEntry.findMany({ where: { periodId } });
    if (rows.length === 0) return null;
    const e = find(rows, "employeeName");
    if (e) return Math.max(0, e.netPayable - (e.amountPaid ?? 0));
    const totalOutstanding = rows.reduce(
      (s, r) => s + Math.max(0, r.netPayable - (r.amountPaid ?? 0)),
      0
    );
    return totalOutstanding;
  }

  if (category.includes("hotel")) {
    const rows = await db.payable.findMany({
      where: { periodId, category: { contains: "Hotel" } },
    });
    const p = find(rows, "supplierName");
    const newBooking = Number(opts?.hotelAgreedCost) || 0;
    if (p) {
      return p.remaining + newBooking;
    }
    return newBooking > 0 ? newBooking : null;
  }

  if (category.includes("transport") || category.includes("driver")) {
    const rows = await db.payable.findMany({
      where: { periodId, category: { contains: "Transport" } },
    });
    const p = find(rows, "supplierName");
    const newJob = Number(opts?.transportAgreedCost) || 0;
    if (p) {
      return p.remaining + newJob;
    }
    return newJob > 0 ? newJob : null;
  }

  if (category.includes("supplier") || category.includes("payable")) {
    const rows = await db.payable.findMany({ where: { periodId } });
    const p = find(rows, "supplierName");
    return p ? p.remaining : null;
  }

  if (category.includes("commission")) {
    const rows = await db.commission.findMany({
      where: { periodId, status: "Accrued" },
    });
    const c = find(rows, "employeeName");
    return c ? c.commissionAmt : null;
  }

  if (category.includes("employee loan") || category.includes("staff advance")) {
    const emps = await db.employee.findMany({ where: { isActive: true } });
    const emp = find(emps, "name");
    if (!emp) return null;
    const loan = await db.employeeLoan.findFirst({
      where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
    });
    return loan ? loan.remainingAmount : null;
  }

  if (category.includes("advance")) {
    const rows = await db.supplierAdvance.findMany({
      where: { periodId, remaining: { gt: 0 } },
    });
    const a = find(rows, "supplierName");
    return a ? a.remaining : null;
  }

  return null;
}
