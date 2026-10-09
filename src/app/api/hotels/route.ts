import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePayableForHotel } from "@/lib/links-service";
import { getSessionUserId } from "@/lib/auth";

function coerceDates(data: Record<string, unknown>) {
  for (const k of ["checkIn", "checkOut"]) {
    if (typeof data[k] === "string" && data[k]) data[k] = new Date(data[k] as string);
    else if (data[k] === "") data[k] = null;
  }
  return data;
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const rows = await prisma.hotelBooking.findMany({
    where: periodId ? { periodId } : {},
    orderBy: { createdAt: "desc" },
    include: { payable: true },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = coerceDates({ ...body });
    delete data.id;
    delete data.payable;
    delete data.payableId;

    const row = await prisma.hotelBooking.create({ data: data as never });
    const payableId = await ensurePayableForHotel(row.id);

    // If user entered cost on the hotel form, forward to payable
    const orig = Number(body.agreedCost) || 0;
    const paid = Number(body.amountPaid) || 0;
    if (payableId && (orig > 0 || paid > 0)) {
      await prisma.payable.update({
        where: { id: payableId },
        data: {
          originalAmount: orig,
          amountPaid: paid,
          remaining: Math.max(0, orig - paid),
          status: orig - paid <= 0 && paid > 0 ? "Paid" : paid > 0 ? "Partial" : "Open",
        },
      });
    }

    const fresh = await prisma.hotelBooking.findUnique({
      where: { id: row.id },
      include: { payable: true },
    });
    return NextResponse.json(fresh);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data = coerceDates({ ...body });
    const id = data.id as string;
    delete data.id;
    delete data.payable;
    delete data.payableId;
    delete data.createdAt;
    delete data.updatedAt;

    const row = await prisma.hotelBooking.update({ where: { id }, data: data as never });
    const payableId = await ensurePayableForHotel(row.id);

    const orig = Number(body.agreedCost) || 0;
    const paid = Number(body.amountPaid) || 0;
    if (payableId && (orig > 0 || paid > 0)) {
      await prisma.payable.update({
        where: { id: payableId },
        data: {
          originalAmount: orig,
          amountPaid: paid,
          remaining: Math.max(0, orig - paid),
          status: orig - paid <= 0 && paid > 0 ? "Paid" : paid > 0 ? "Partial" : "Open",
        },
      });
    }

    const fresh = await prisma.hotelBooking.findUnique({
      where: { id: row.id },
      include: { payable: true },
    });
    return NextResponse.json(fresh);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const hotel = await prisma.hotelBooking.findUnique({ where: { id } });
  await prisma.hotelBooking.delete({ where: { id } });
  // Optionally remove orphan payable
  if (hotel?.payableId) {
    const stillLinked = await prisma.hotelBooking.findFirst({
      where: { payableId: hotel.payableId },
    });
    if (!stillLinked) {
      await prisma.payable.delete({ where: { id: hotel.payableId } }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}