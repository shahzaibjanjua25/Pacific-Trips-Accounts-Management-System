import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { computeSalesPayroll } from "@/lib/payroll-service";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { periodId } = await req.json();
    if (!periodId) return NextResponse.json({ error: "periodId required" }, { status: 400 });
    const results = await computeSalesPayroll(periodId);
    return NextResponse.json({ ok: true, results });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Compute failed" }, { status: 500 });
  }
}