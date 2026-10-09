import { NextRequest, NextResponse } from "next/server";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";

export async function GET() {
  const periods = await listPeriods();
  return NextResponse.json(periods);
}

export async function POST(req: NextRequest) {
  try {
    const { year, month } = await req.json();
    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json({ error: "year and month (1-12) required" }, { status: 400 });
    }
    const period = await getOrCreatePeriod(Number(year), Number(month));
    return NextResponse.json(period);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
