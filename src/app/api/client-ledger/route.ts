import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get("clientId");
  if (!clientId) return NextResponse.json([]);
  const rows = await prisma.clientLedger.findMany({
    where: { clientId },
    orderBy: { tourDate: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.clientId) return NextResponse.json({ error: "clientId required" }, { status: 400 });
    const row = await prisma.clientLedger.create({
      data: {
        clientId: body.clientId,
        tourDate: body.tourDate ? new Date(body.tourDate) : null,
        description: body.description || null,
        category: body.category || null,
        subCategory: body.subCategory || null,
        clientName: body.clientName || null,
        hotel: body.hotel || null,
        debit: Number(body.debit) || 0,
        credit: Number(body.credit) || 0,
        approvedBy: body.approvedBy || null,
        status: body.status || null,
        receiptRef: body.receiptRef || null,
        enteredBy: body.enteredBy || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { id, ...rest } = body;
    if (rest.tourDate) rest.tourDate = new Date(rest.tourDate);
    if (rest.debit != null) rest.debit = Number(rest.debit);
    if (rest.credit != null) rest.credit = Number(rest.credit);
    delete rest.createdAt;
    delete rest.updatedAt;
    const row = await prisma.clientLedger.update({ where: { id }, data: rest });
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.clientLedger.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
