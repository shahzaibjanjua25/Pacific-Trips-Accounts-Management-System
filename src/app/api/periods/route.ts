import { NextRequest, NextResponse } from "next/server";
import { canCloseMonth, createPeriod, listPeriods } from "@/lib/period";
import { getSessionUserId } from "@/lib/auth";
import { CarryForwardError } from "@/lib/carry-forward";
import { deleteBackedUpMonth, matchesMonthBackup, readMonthBackup } from "@/lib/month-backup";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const periods = await listPeriods();
  return NextResponse.json(periods);
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { year, month, carryForward } = await req.json();
    if (!Number.isInteger(year) || year < 1900 || year > 9999 ||
        !Number.isInteger(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: "Choose a valid month and year." }, { status: 400 });
    }
    const { period, carried } = await createPeriod(year, month, carryForward === true);
    return NextResponse.json({ ...period, carried });
  } catch (e) {
    if (e instanceof CarryForwardError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    if (isConcurrentChange(e)) {
      return NextResponse.json({ error: "A month changed while you were creating this one. Please retry." }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Could not create the month." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await req.json();
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "Choose a month to close." }, { status: 400 });
  }
  const period = await prisma.period.findUnique({ where: { id } });
  if (!period) return NextResponse.json({ error: "Month not found." }, { status: 404 });
  if (!canCloseMonth(period.year, period.month)) {
    return NextResponse.json({ error: "Close this month after it ends in Pakistan time." }, { status: 409 });
  }
  const result = await prisma.period.updateMany({ where: { id, isClosed: false }, data: { isClosed: true } });
  return NextResponse.json({ ok: true, closed: result.count > 0 || period.isClosed });
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, proof } = await req.json();
    if (typeof id !== "string" || typeof proof !== "string") {
      return NextResponse.json({ error: "Download a backup before deleting this month." }, { status: 400 });
    }
    const result = await prisma.$transaction(async (db) => {
      const snapshot = await readMonthBackup(db, id);
      if (!snapshot) return "missing";
      if (!matchesMonthBackup(snapshot, uid, proof)) return "changed";
      const payableIds = snapshot.period.payables.map((row) => row.id);
      const references = { periodId: { not: id }, payableId: { in: payableIds } };
      if (await db.hotelBooking.count({ where: references }) ||
          await db.transportJob.count({ where: references })) return "linked";
      await deleteBackedUpMonth(db, snapshot);
      return "deleted";
    }, { isolationLevel: "Serializable", timeout: 60_000 });
    if (result === "missing") return NextResponse.json({ error: "Month not found." }, { status: 404 });
    if (result === "linked") return NextResponse.json({ error: "Another month still links to a payable in this month." }, { status: 409 });
    if (result === "changed") {
      return NextResponse.json({ error: "The month changed or the backup expired. Download a new backup before deleting." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (isConcurrentChange(error)) {
      return NextResponse.json({ error: "Data changed during deletion. Download a fresh backup and try again." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Could not delete the month. Its data was kept." }, { status: 500 });
  }
}

function isConcurrentChange(error: unknown) {
  return !!error && typeof error === "object" && "code" in error &&
    (error.code === "P2034" || error.code === "P2002");
}
