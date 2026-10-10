// src/app/api/admin/seed/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { runSeed } from "@/lib/seed";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const force = !!body.force;

    const result = await runSeed(force);
    if (!result.ok) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (e) {
    console.error("[admin:seed]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [
    periods, employees, clients, receivables, payables,
    payroll, bankBalances, assets, vadets,
  ] = await Promise.all([
    prisma.period.count(),
    prisma.employee.count(),
    prisma.client.count(),
    prisma.receivable.count(),
    prisma.payable.count(),
    prisma.payrollEntry.count(),
    prisma.bankBalance.count(),
    prisma.asset.count(),
    prisma.vadet.count(),
  ]);

  return NextResponse.json({
    periods, employees, clients, receivables, payables,
    payroll, bankBalances, assets, vadets,
    isEmpty: periods === 0,
  });
}