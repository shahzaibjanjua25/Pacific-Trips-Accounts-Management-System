import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncFromHotel } from "@/lib/module-sync";

function enrich(data: Record<string, unknown>) {
  const agreed = Number(data.agreedCost) || 0;
  const paid = Number(data.amountPaid) || 0;
  data.remaining = Math.max(0, agreed - paid);
  for (const k of ["checkIn", "checkOut"]) {
    if (typeof data[k] === "string" && data[k]) data[k] = new Date(data[k] as string);
  }
  return data;
}

export async function GET(req: NextRequest) {
  const periodId = req.nextUrl.searchParams.get("periodId");
  const rows = await prisma.hotelBooking.findMany({
    where: periodId ? { periodId } : {},
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = enrich({ ...body });
    delete data.id;
    const row = await prisma.hotelBooking.create({ data: data as never });
    await syncFromHotel(row.id);
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const data = enrich({ ...body });
    const id = data.id as string;
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    const row = await prisma.hotelBooking.update({ where: { id }, data: data as never });
    await syncFromHotel(row.id);
    return NextResponse.json(row);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await prisma.hotelBooking.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
