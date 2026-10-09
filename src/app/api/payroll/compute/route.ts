import { NextRequest, NextResponse } from "next/server";
import { computeSalesPayroll } from "@/lib/payroll-service";

export async function POST(req: NextRequest) {
  try {
    const { periodId } = await req.json();
    if (!periodId) return NextResponse.json({ error: "periodId required" }, { status: 400 });
    const results = await computeSalesPayroll(periodId);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
