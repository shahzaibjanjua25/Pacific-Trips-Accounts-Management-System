import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

async function guard() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

const SECTIONS = new Set(["Asset", "Liability", "Equity"]);

async function seedDefaults(periodId: string) {
  const [banks, receivables, payables, assets, liabilities, loans] =
    await Promise.all([
      prisma.bankBalance.findMany(),
      prisma.receivable.findMany({ where: { periodId } }),
      prisma.payable.findMany({ where: { periodId } }),
      prisma.asset.findMany(),
      prisma.liability.findMany({ where: { periodId } }),
      prisma.employeeLoan.findMany({ where: { remainingAmount: { gt: 0 } } }),
    ]);

  const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
  const recvTotal = receivables.reduce((s, r) => s + r.remainingAmount, 0);
  const payTotal = payables.reduce((s, p) => s + p.remaining, 0);
  const assetTotal = assets.reduce((s, a) => s + a.purchaseCost, 0);
  const liabTotal = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const loanTotal = loans.reduce((s, l) => s + l.remainingAmount, 0);

  const defaults: {
    section: string;
    label: string;
    amount: number;
    sortOrder: number;
  }[] = [
    { section: "Asset", label: "Bank & Cash", amount: bankTotal, sortOrder: 10 },
    {
      section: "Asset",
      label: "Accounts Receivable",
      amount: recvTotal,
      sortOrder: 20,
    },
    {
      section: "Asset",
      label: "Employee Loans Receivable",
      amount: loanTotal,
      sortOrder: 30,
    },
    {
      section: "Asset",
      label: "Fixed Assets (at cost)",
      amount: assetTotal,
      sortOrder: 40,
    },
    {
      section: "Liability",
      label: "Accounts Payable",
      amount: payTotal,
      sortOrder: 10,
    },
    {
      section: "Liability",
      label: "Other Liabilities",
      amount: liabTotal,
      sortOrder: 20,
    },
    {
      section: "Equity",
      label: "Owner Equity / Capital",
      amount: Math.max(
        0,
        bankTotal + recvTotal + loanTotal + assetTotal - payTotal - liabTotal
      ),
      sortOrder: 10,
    },
  ];

  await prisma.balanceSheetLine.createMany({
    data: defaults.map((d) => ({ periodId, ...d })),
  });
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (g) return g;

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) {
    return NextResponse.json({ error: "periodId required" }, { status: 400 });
  }

  let rows = await prisma.balanceSheetLine.findMany({
    where: { periodId },
    orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  if (rows.length === 0) {
    await seedDefaults(periodId);
    rows = await prisma.balanceSheetLine.findMany({
      where: { periodId },
      orderBy: [{ section: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;

  try {
    const body = await req.json();
    const periodId = body.periodId as string;
    const section = (body.section || "Asset") as string;
    const label = String(body.label || "").trim();
    if (!periodId || !label) {
      return NextResponse.json(
        { error: "periodId and label required" },
        { status: 400 }
      );
    }
    if (!SECTIONS.has(section)) {
      return NextResponse.json(
        { error: "section must be Asset, Liability, or Equity" },
        { status: 400 }
      );
    }

    const maxSort = await prisma.balanceSheetLine.aggregate({
      where: { periodId, section },
      _max: { sortOrder: true },
    });

    const row = await prisma.balanceSheetLine.create({
      data: {
        periodId,
        section,
        label,
        amount: Number(body.amount) || 0,
        sortOrder: (maxSort._max.sortOrder ?? 0) + 10,
        notes: body.notes || null,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[balance-sheet:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const g = await guard();
  if (g) return g;

  try {
    const body = await req.json();
    const id = body.id as string;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (body.label != null) data.label = String(body.label).trim();
    if (body.amount != null) data.amount = Number(body.amount) || 0;
    if (body.section != null) {
      if (!SECTIONS.has(body.section)) {
        return NextResponse.json(
          { error: "section must be Asset, Liability, or Equity" },
          { status: 400 }
        );
      }
      data.section = body.section;
    }
    if (body.sortOrder != null) data.sortOrder = Number(body.sortOrder) || 0;
    if (body.notes !== undefined) data.notes = body.notes || null;

    const row = await prisma.balanceSheetLine.update({
      where: { id },
      data,
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[balance-sheet:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (g) return g;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await prisma.balanceSheetLine.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}