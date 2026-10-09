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
    const txn = await postTransaction({
      periodId: body.periodId,
      date: body.date,
      description: body.description,
      category: body.category || "Expense",
      subCategory: body.subCategory,
      party: body.party,
      tripRef: body.tripRef,
      debit: Number(body.debit) || 0,
      credit: Number(body.credit) || 0,
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
