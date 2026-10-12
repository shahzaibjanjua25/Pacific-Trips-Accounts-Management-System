import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

async function guard() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return null;
}

/** Only columns that exist on ClientLedger */
function pickLedger(body: Record<string, unknown>, includeClientId = false) {
  const data: Record<string, unknown> = {
    tourDate: body.tourDate ? new Date(body.tourDate as string) : null,
    description: body.description ?? null,
    category: body.category ?? null,
    subCategory: body.subCategory ?? null,
    hotel: body.hotel ?? null,
    debit: Number(body.debit) || 0,
    credit: Number(body.credit) || 0,
    status: body.status ?? null,
    receiptRef: body.receiptRef ?? null,
    enteredBy: body.enteredBy ?? null,
    notes: body.notes ?? null,
  };
  if (includeClientId && body.clientId) {
    data.clientId = body.clientId;
  }
  // Explicitly NEVER include: clientName, client, id, createdAt, updatedAt
  return data;
}

export async function GET(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json([]);
  const rows = await prisma.clientLedger.findMany({
    where: { clientId },
    orderBy: { tourDate: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  try {
    const body = await req.json();
    if (!body.clientId) {
      return NextResponse.json({ error: "clientId required" }, { status: 400 });
    }
    const data = pickLedger(body, true);
    const row = await prisma.clientLedger.create({ data: data as never });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[client-ledger:POST]", e);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  try {
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const id = body.id as string;
    const data = pickLedger(body, false);
    const row = await prisma.clientLedger.update({
      where: { id },
      data: data as never,
    });
    return NextResponse.json(row);
  } catch (e) {
    console.error("[client-ledger:PUT]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const g = await guard();
  if (g) return g;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.clientLedger.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
