import { NextRequest, NextResponse } from "next/server";
import { createPeriod, listPeriods } from "@/lib/period";
import { getSessionUserId } from "@/lib/auth";

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
    const { year, month } = await req.json();
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year and month (1-12) required" }, { status: 400 });
    }
    const { period, carried } = await createPeriod(Number(year), Number(month));
    return NextResponse.json({ ...period, carried });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}