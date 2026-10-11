import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * GET /api/outstanding?periodId=...&category=...&party=...
 * Returns { outstanding: number, exists: boolean }
 */
export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const category = (req.nextUrl.searchParams.get("category") || "").toLowerCase();
  const party = req.nextUrl.searchParams.get("party") || "";

  if (!periodId || !category || !party) {
    return NextResponse.json(
      { error: "periodId, category, party required" },
      { status: 400 }
    );
  }

  const nameMatch = (a: string, b: string) => {
    const x = a.toLowerCase().trim();
    const y = b.toLowerCase().trim();
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  };

  let outstanding = 0;
  let exists = false;

  // ── Salary / Payroll ──
  if (category.includes("salary") || category.includes("payroll")) {
    const rows = await prisma.payrollEntry.findMany({ where: { periodId } });
    const entry =
      rows.find((r) => nameMatch(r.employeeName, party)) ??
      rows.find((r) => {
        const a = r.employeeName.toLowerCase().trim().split(/\s+/);
        const b = party.toLowerCase().trim().split(/\s+/);
        const lastA = a[a.length - 1];
        const lastB = b[b.length - 1];
        return !!lastA && lastA === lastB && lastA.length > 2;
      });
    if (entry) {
      exists = true;
      outstanding = Math.max(0, entry.netPayable - (entry.amountPaid ?? 0));
    }
  }

  // ── Hotel ──
  else if (category.includes("hotel")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Hotel" } },
    });
    const p = rows.find((r) => nameMatch(r.supplierName, party));
    if (p) {
      exists = true;
      outstanding = p.remaining;
    }
  }

  // ── Transport ──
  else if (category.includes("transport") || category.includes("driver")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Transport" } },
    });
    const p = rows.find((r) => nameMatch(r.supplierName, party));
    if (p) {
      exists = true;
      outstanding = p.remaining;
    }
  }

  // ── Ticketing ──
  else if (category.includes("ticketing")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Ticketing" } },
    });
    const p = rows.find((r) => nameMatch(r.supplierName, party));
    if (p) {
      exists = true;
      outstanding = p.remaining;
    }
  }

  // ── Supplier / Payable (generic) ──
  else if (category.includes("supplier") || category.includes("payable")) {
    const rows = await prisma.payable.findMany({ where: { periodId } });
    const p = rows.find((r) => nameMatch(r.supplierName, party));
    if (p) {
      exists = true;
      outstanding = p.remaining;
    }
  }

  // ── Commission ──
  else if (category.includes("commission")) {
    const rows = await prisma.commission.findMany({
      where: { periodId, status: "Accrued" },
    });
    const c = rows.find((r) => nameMatch(r.employeeName, party));
    if (c) {
      exists = true;
      outstanding = c.commissionAmt;
    }
  }

  // ── Refund ──
  else if (category.includes("refund")) {
    const rows = await prisma.refund.findMany({
      where: { periodId, status: "Pending" },
    });
    const r = rows.find((row) => nameMatch(row.clientName, party));
    if (r) {
      exists = true;
      outstanding = r.amount;
    }
  }

  return NextResponse.json({ outstanding, exists });
}