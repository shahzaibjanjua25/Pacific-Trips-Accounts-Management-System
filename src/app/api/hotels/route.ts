import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePayableForHotel } from "@/lib/links-service";
import { getSessionUserId } from "@/lib/auth";

/** Only real HotelBooking columns - money lives on Payable */
const HOTEL_FIELDS = [
  "periodId",
  "hotelName",
  "clientName",
  "tripRef",
  "checkIn",
  "checkOut",
  "nights",
  "rooms",
  "status",
  "notes",
] as const;

function pickHotel(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of HOTEL_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  for (const k of ["checkIn", "checkOut"]) {
    if (typeof out[k] === "string" && out[k]) out[k] = new Date(out[k] as string);
    else if (out[k] === "") out[k] = null;
  }
  if (typeof out.nights === "string") out.nights = parseInt(out.nights as string, 10) || null;
  if (typeof out.rooms === "string") out.rooms = parseInt(out.rooms as string, 10) || null;
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out;
}

function payableMoney(body: Record<string, unknown>) {
  const orig = Number(body.agreedCost) || 0;
  const paid = Number(body.amountPaid) || 0;
  const remaining = Math.max(0, orig - paid);
  const status =
    remaining <= 0 && paid > 0 ? "Paid" : paid > 0 ? "Partial" : "Open";
  return { orig, paid, remaining, status };
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
    const data = pickHotel(body);
    delete data.id;

    const row = await prisma.hotelBooking.create({ data: data as never });
    const payableId = await ensurePayableForHotel(row.id);

    const { orig, paid, remaining, status } = payableMoney(body);
    if (payableId && (orig > 0 || paid > 0)) {
      await prisma.payable.update({
        where: { id: payableId },
        data: {
          originalAmount: orig,
          amountPaid: paid,
          remaining,
          status,
        },
      });
      // keep operational status in sync
      await prisma.hotelBooking.update({
        where: { id: row.id },
        data: {
          status:
            remaining <= 0 && paid > 0
              ? "Paid"
              : paid > 0
                ? "Partial"
                : (row.status as string) || "Booked",
        },
      });
    }

    const fresh = await prisma.hotelBooking.findUnique({
      where: { id: row.id },
      include: { payable: true },
    });
    return NextResponse.json(fresh);
  } catch (e) {
    console.error("[hotels:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const id = body.id as string;
    const data = pickHotel(body);
    // never overwrite period / ids on update
    delete data.periodId;

    const row = await prisma.hotelBooking.update({
      where: { id },
      data: data as never,
    });
    const payableId = await ensurePayableForHotel(row.id);

    const { orig, paid, remaining, status } = payableMoney(body);
    // Always sync payable when either amount is present (including zeroing)
    if (payableId && ("agreedCost" in body || "amountPaid" in body)) {
      await prisma.payable.update({
        where: { id: payableId },
        data: {
          originalAmount: orig,
          amountPaid: paid,
          remaining,
          status,
        },
      });
      await prisma.hotelBooking.update({
        where: { id: row.id },
        data: {
          status:
            body.status ||
            (remaining <= 0 && paid > 0
              ? "Paid"
              : paid > 0
                ? "Partial"
                : "Booked"),
        },
      });
    }

    const fresh = await prisma.hotelBooking.findUnique({
      where: { id: row.id },
      include: { payable: true },
    });
    return NextResponse.json(fresh);
  } catch (e) {
    console.error("[hotels:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const hotel = await prisma.hotelBooking.findUnique({ where: { id } });
    if (!hotel) return NextResponse.json({ ok: true, alreadyGone: true });

    await prisma.hotelBooking.delete({ where: { id } });

    if (hotel.payableId) {
      const stillLinked = await prisma.hotelBooking.findFirst({
        where: { payableId: hotel.payableId },
      });
      if (!stillLinked) {
        await prisma.payable.delete({ where: { id: hotel.payableId } }).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[hotels:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
