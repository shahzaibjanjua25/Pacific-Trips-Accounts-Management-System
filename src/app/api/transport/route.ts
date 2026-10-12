import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePayableForTransport } from "@/lib/links-service";
import { getSessionUserId } from "@/lib/auth";

/** Only real TransportJob columns - money lives on Payable */
const JOB_FIELDS = [
  "periodId",
  "driverName",
  "vehicle",
  "clientName",
  "tripRef",
  "fuelCost",
  "status",
  "notes",
] as const;

function pickJob(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of JOB_FIELDS) {
    if (k in body) out[k] = body[k];
  }
  if (typeof out.fuelCost === "string") out.fuelCost = parseFloat(out.fuelCost as string) || 0;
  for (const k of Object.keys(out)) {
    if (out[k] === "") out[k] = null;
  }
  return out;
}

function payableMoney(body: Record<string, unknown>) {
  // UI may send agreedCost / amountPaid or finalSettlement
  const orig = Number(body.agreedCost) || 0;
  const paid =
    Number(body.amountPaid) ||
    Number(body.finalSettlement) ||
    0;
  const remaining = Math.max(0, orig - paid);
  const status =
    remaining <= 0 && paid > 0 ? "Paid" : paid > 0 ? "Partial" : "Open";
  return { orig, paid, remaining, status };
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const rows = await prisma.transportJob.findMany({
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
    const data = pickJob(body);
    delete data.id;

    const row = await prisma.transportJob.create({ data: data as never });
    const payableId = await ensurePayableForTransport(row.id);

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
      await prisma.transportJob.update({
        where: { id: row.id },
        data: {
          status:
            remaining <= 0 && paid > 0
              ? "Settled"
              : paid > 0
                ? "Partial"
                : (row.status as string) || "Pending",
        },
      });
    }

    const fresh = await prisma.transportJob.findUnique({
      where: { id: row.id },
      include: { payable: true },
    });
    return NextResponse.json(fresh);
  } catch (e) {
    console.error("[transport:POST]", e);
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
    const data = pickJob(body);
    delete data.periodId;

    const row = await prisma.transportJob.update({
      where: { id },
      data: data as never,
    });
    const payableId = await ensurePayableForTransport(row.id);

    const { orig, paid, remaining, status } = payableMoney(body);
    if (
      payableId &&
      ("agreedCost" in body || "amountPaid" in body || "finalSettlement" in body)
    ) {
      await prisma.payable.update({
        where: { id: payableId },
        data: {
          originalAmount: orig,
          amountPaid: paid,
          remaining,
          status,
        },
      });
      await prisma.transportJob.update({
        where: { id: row.id },
        data: {
          status:
            body.status ||
            (remaining <= 0 && paid > 0
              ? "Settled"
              : paid > 0
                ? "Partial"
                : "Pending"),
        },
      });
    }

    const fresh = await prisma.transportJob.findUnique({
      where: { id: row.id },
      include: { payable: true },
    });
    return NextResponse.json(fresh);
  } catch (e) {
    console.error("[transport:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const job = await prisma.transportJob.findUnique({ where: { id } });
  if (!job) return NextResponse.json({ ok: true, alreadyGone: true });

  await prisma.transportJob.delete({ where: { id } });
  if (job.payableId) {
    const stillLinked = await prisma.transportJob.findFirst({
      where: { payableId: job.payableId },
    });
    if (!stillLinked) {
      await prisma.payable.delete({ where: { id: job.payableId } }).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true });
}
