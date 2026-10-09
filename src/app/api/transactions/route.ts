import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const txn = await prisma.transaction.create({
      data: {
        periodId: body.periodId,
        date: new Date(body.date),
        description: body.description,
        category: body.category || "Expense",
        subCategory: body.subCategory || null,
        party: body.party || null,
        tripRef: body.tripRef || null,
        debit: body.debit || 0,
        credit: body.credit || 0,
        paymentMethod: body.paymentMethod || null,
        bankAccount: body.bankAccount || null,
        status: body.status || "Completed",
        enteredBy: body.enteredBy || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json(txn);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) return NextResponse.json([]);
  const txns = await prisma.transaction.findMany({
    where: { periodId },
    orderBy: { date: "desc" },
  });
  return NextResponse.json(txns);
}
