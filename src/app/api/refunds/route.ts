import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import {
  syncRefundToClientLedger,
  removeRefundFromClientLedger,
} from "@/lib/links-service";

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const rows = await prisma.refund.findMany({
    where: periodId ? { periodId } : {},
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const data: Record<string, unknown> = {
      periodId: body.periodId,
      clientName: body.clientName,
      amount: Number(body.amount) || 0,
      reason: body.reason || null,
      status: body.status || "Pending",
      tripRef: body.tripRef || null,
      notes: body.notes || null,
    };
    if (body.clientId) data.clientId = body.clientId;
    if (body.paidDate) data.paidDate = new Date(body.paidDate);
    else data.paidDate = null;

    const row = await prisma.refund.create({ data: data as never });
    await syncRefundToClientLedger(row.id);
    return NextResponse.json(row);
  } catch (e) {
    console.error("[refunds:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (body.clientName !== undefined) data.clientName = body.clientName;
    if (body.amount !== undefined) data.amount = Number(body.amount) || 0;
    if (body.reason !== undefined) data.reason = body.reason || null;
    if (body.status !== undefined) data.status = body.status;
    if (body.tripRef !== undefined) data.tripRef = body.tripRef || null;
    if (body.notes !== undefined) data.notes = body.notes || null;
    if (body.paidDate !== undefined)
      data.paidDate = body.paidDate ? new Date(body.paidDate) : null;

    const row = await prisma.refund.update({
      where: { id: body.id },
      data: data as never,
    });
    await syncRefundToClientLedger(row.id);
    return NextResponse.json(row);
  } catch (e) {
    console.error("[refunds:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await removeRefundFromClientLedger(id);
    await prisma.refund.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[refunds:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}