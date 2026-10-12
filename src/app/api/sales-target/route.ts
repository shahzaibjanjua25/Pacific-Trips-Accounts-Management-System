// src/app/api/sales-target/route.ts — should already exist
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  if (!periodId) {
    return NextResponse.json({ error: "periodId required" }, { status: 400 });
  }

  let row = await prisma.salesTarget.findUnique({ where: { periodId } });
  if (!row) {
    row = await prisma.salesTarget.create({
      data: { periodId, targetAmount: 12_000_000 },
    });
  }
  return NextResponse.json(row);
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { periodId, targetAmount, notes } = body;
    if (!periodId) {
      return NextResponse.json({ error: "periodId required" }, { status: 400 });
    }

    const row = await prisma.salesTarget.upsert({
      where: { periodId },
      create: {
        periodId,
        targetAmount: Number(targetAmount) || 12_000_000,
        notes: notes || null,
      },
      update: {
        targetAmount: Number(targetAmount) || 12_000_000,
        notes: notes || null,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[sales-target:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}