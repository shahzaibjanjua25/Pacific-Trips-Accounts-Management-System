import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { syncPayrollForEmployee } from "@/lib/links-service";

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { periodId } = await req.json();
    if (!periodId) return NextResponse.json({ error: "periodId required" }, { status: 400 });

    const salesStaff = await prisma.employee.findMany({
      where: { isActive: true, role: "Sales" },
    });

    for (const emp of salesStaff) {
      await syncPayrollForEmployee(periodId, emp.name);
    }

    return NextResponse.json({ ok: true, count: salesStaff.length });
  } catch (e) {
    console.error("[payroll:sync-all]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}