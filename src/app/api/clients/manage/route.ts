import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const recv = periodId
    ? await prisma.receivable.findFirst({
        where: { periodId, clientId: id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  return NextResponse.json({ client, receivable: recv });
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { id, name, phone, contact, email, notes, totalPackage, amountPaid } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    // Update client master
    const client = await prisma.client.update({
      where: { id },
      data: {
        name: name ?? undefined,
        phone: phone ?? undefined,
        contact: contact ?? undefined,
        email: email ?? undefined,
        notes: notes ?? undefined,
      },
    });

    // Update/create the receivable for the supplied period
    const periodId = req.nextUrl.searchParams.get("periodId");
    if (periodId && (totalPackage != null || amountPaid != null)) {
      const existing = await prisma.receivable.findFirst({
        where: { periodId, clientId: id },
        orderBy: { createdAt: "desc" },
      });

      const tp = Number(totalPackage) || 0;
      const paid = Number(amountPaid) || 0;
      const remaining = Math.max(0, tp - paid);

      if (existing) {
        await prisma.receivable.update({
          where: { id: existing.id },
          data: {
            totalPackage: tp || existing.totalPackage,
            amountToReceive: tp || existing.amountToReceive,
            amountReceived: paid,
            remainingAmount: remaining,
            status: remaining <= 0 && paid > 0 ? "Settled" : paid > 0 ? "Partial" : "Open",
          },
        });
      } else if (tp > 0 || paid > 0) {
        await prisma.receivable.create({
          data: {
            periodId,
            clientId: id,
            clientName: client.name,
            totalPackage: tp,
            amountToReceive: tp,
            amountReceived: paid,
            remainingAmount: remaining,
            status: remaining <= 0 && paid > 0 ? "Settled" : paid > 0 ? "Partial" : "Open",
            notes: "Edited from Clients page",
          },
        });
      }
    }

    return NextResponse.json({ ok: true, client });
  } catch (e) {
    console.error("[clients:manage:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Remove dependents first (ledger rows and receivables belonging to this client)
  await prisma.clientLedger.deleteMany({ where: { clientId: id } });
  await prisma.receivable.deleteMany({ where: { clientId: id } });
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}