import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { propagatePayableToOperational } from "@/lib/links-service";
import { calcOverdue } from "@/lib/utils";
import { getSessionUserId } from "@/lib/auth";

function enrich(data: Record<string, unknown>) {
  const orig = Number(data.originalAmount) || 0;
  const paid = Number(data.amountPaid) || 0;
  data.remaining = Math.max(0, orig - paid);
  if ((data.remaining as number) === 0 && paid > 0) data.status = "Paid";
  else if (paid > 0) data.status = "Partial";
  else data.status = data.status || "Open";

  const due = data.dueDate ? new Date(data.dueDate as string) : null;
  data.daysOverdue = calcOverdue(due);

  for (const k of Object.keys(data)) {
    if (k.toLowerCase().includes("date") && typeof data[k] === "string" && data[k]) {
      data[k] = new Date(data[k] as string);
    } else if (data[k] === "") {
      data[k] = null;
    }
  }
  return data;
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const rows = await prisma.payable.findMany({
    where: periodId ? { periodId } : {},
    orderBy: { createdAt: "desc" },
    include: {
      hotelBooking: true,
      transportJob: true,
    },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = enrich({ ...body });
    delete data.id;
    delete data.hotelBooking;
    delete data.transportJob;

    const row = await prisma.payable.create({ data: data as never });
    await propagatePayableToOperational(row.id);
    return NextResponse.json(row);
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
    const data = enrich({ ...body });
    const id = data.id as string;
    delete data.id;
    delete data.hotelBooking;
    delete data.transportJob;
    delete data.createdAt;
    delete data.updatedAt;

    const row = await prisma.payable.update({ where: { id }, data: data as never });
    await propagatePayableToOperational(row.id);
    return NextResponse.json(row);
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
  await prisma.payable.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}