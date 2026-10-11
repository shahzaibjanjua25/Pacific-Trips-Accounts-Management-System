import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  postTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/lib/transaction-service";

export async function GET(req: NextRequest) {
  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) return NextResponse.json([]);
  const txns = await prisma.transaction.findMany({
    where: { periodId },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(txns);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const cat = (body.category || "").toLowerCase();
    const party = body.party || body.subCategory || "";
    const debit = Number(body.debit) || 0;
    const credit = Number(body.credit) || 0;
    const isNewClient = !!body.isNewClient;

    const isClientReceipt =
      cat.includes("receipt") ||
      cat.includes("revenue") ||
      cat.includes("client receipt");
    const amountMoving = isClientReceipt ? debit : credit;

    // Server-side overpayment guard
    if (party && amountMoving > 0 && body.periodId && !isNewClient) {
      const outstanding = await lookupOutstanding(body.periodId, cat, party);
      if (outstanding != null && amountMoving > outstanding) {
        return NextResponse.json(
          {
            error:
              `Overpayment blocked: ${party} has outstanding ${outstanding}, ` +
              `but ${amountMoving} was entered.`,
          },
          { status: 400 }
        );
      }
    }

    const txn = await postTransaction({
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
      status: body.status || "Completed",
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
      clientTotalPackage: Number(body.clientTotalPackage) || 0,
      clientAmountPaid: Number(body.clientAmountPaid) || 0,
      hotelAgreedCost: Number(body.hotelAgreedCost) || 0,
      clientPhone: body.clientPhone || null,
      clientContact: body.clientContact || null,
      clientEmail: body.clientEmail || null,
      clientNotes: body.clientNotes || null,
      isNewClient,
      salesperson: body.salesperson || null,
    });
    return NextResponse.json(txn);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const cat = (body.category || "").toLowerCase();
    const party = body.party || body.subCategory || "";
    const debit = Number(body.debit) || 0;
    const credit = Number(body.credit) || 0;

    const isClientReceipt =
      cat.includes("receipt") ||
      cat.includes("revenue") ||
      cat.includes("client receipt");
    const amountMoving = isClientReceipt ? debit : credit;

    if (party && amountMoving > 0 && !body.isNewClient) {
      const existing = await prisma.transaction.findUnique({
        where: { id: body.id },
      });
      if (existing) {
        const outstanding = await lookupOutstanding(
          existing.periodId,
          cat,
          party
        );
        if (outstanding != null && amountMoving > outstanding) {
          return NextResponse.json(
            {
              error:
                `Overpayment blocked: ${party} has outstanding ${outstanding}, ` +
                `but ${amountMoving} was entered.`,
            },
            { status: 400 }
          );
        }
      }
    }

    const txn = await updateTransaction(body.id, {
      date: body.date,
      description: body.description,
      category: body.category,
      subCategory: body.subCategory,
      party: body.party,
      tripRef: body.tripRef,
      debit: body.debit != null ? Number(body.debit) : undefined,
      credit: body.credit != null ? Number(body.credit) : undefined,
      paymentMethod: body.paymentMethod,
      bankAccount: body.bankAccount,
      status: body.status,
      enteredBy: body.enteredBy,
      notes: body.notes,
      hotelAgreedCost:
        body.hotelAgreedCost != null ? Number(body.hotelAgreedCost) : undefined,
      salesperson: body.salesperson || null,
    });
    return NextResponse.json(txn);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await deleteTransaction(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function lookupOutstanding(
  periodId: string,
  category: string,
  party: string
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
    const rows = await prisma.receivable.findMany({
      where: { periodId, remainingAmount: { gt: 0 } },
    });
    const r = find(rows, "clientName");
    return r ? r.remainingAmount : 0;
  }

  if (category.includes("salary") || category.includes("payroll")) {
    const rows = await prisma.payrollEntry.findMany({ where: { periodId } });
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
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Hotel" } },
    });
    const p = find(rows, "supplierName");
    return p ? p.remaining : null;
  }

  if (category.includes("transport") || category.includes("driver")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Transport" } },
    });
    const p = find(rows, "supplierName");
    return p ? p.remaining : null;
  }

  if (category.includes("ticketing")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Ticketing" } },
    });
    const p = find(rows, "supplierName");
    return p ? p.remaining : null;
  }

  if (category.includes("supplier") || category.includes("payable")) {
    const rows = await prisma.payable.findMany({ where: { periodId } });
    const p = find(rows, "supplierName");
    return p ? p.remaining : null;
  }

  if (category.includes("commission")) {
    const rows = await prisma.commission.findMany({
      where: { periodId, status: "Accrued" },
    });
    const c = find(rows, "employeeName");
    return c ? c.commissionAmt : null;
  }

  if (category.includes("refund")) {
    const rows = await prisma.refund.findMany({
      where: { periodId, status: "Pending" },
    });
    const r = find(rows, "clientName");
    return r ? r.amount : null;
  }

  if (category.includes("employee loan") || category.includes("staff advance")) {
    const emps = await prisma.employee.findMany({ where: { isActive: true } });
    const emp = find(emps, "name");
    if (!emp) return null;
    const loan = await prisma.employeeLoan.findFirst({
      where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
    });
    return loan ? loan.remainingAmount : null;
  }

  if (category.includes("advance")) {
    const rows = await prisma.supplierAdvance.findMany({
      where: { periodId, remaining: { gt: 0 } },
    });
    const a = find(rows, "supplierName");
    return a ? a.remaining : null;
  }

  return null;
}