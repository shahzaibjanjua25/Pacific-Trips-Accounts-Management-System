import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { syncBalanceSheet } from "@/lib/balance-sheet-sync";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const periodId = body.periodId as string;
    if (!periodId) {
      return NextResponse.json({ error: "periodId required" }, { status: 400 });
    }
    const sections: string[] =
      Array.isArray(body.sections) && body.sections.length
        ? body.sections
        : ["Asset", "Liability", "Equity"];

    const result = await syncBalanceSheet(periodId, sections);

    return NextResponse.json({
      ok: true,
      ...result,
      message: `${result.updated} line(s) updated, ${result.created} line(s) created.`,
    });
  } catch (e) {
    console.error("[balance-sheet:sync]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}