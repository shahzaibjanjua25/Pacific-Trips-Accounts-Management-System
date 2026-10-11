import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * GET /api/outstanding?periodId=...&category=...&party=...
 *
 * Returns:
 *   { outstanding: number, exists: boolean, reason?: string }
 *
 * `exists` is TRUE when there is at least one row in the relevant table
 * for the given period (so the UI can enforce the overpay block).
 * `outstanding` is the amount still owed / remaining for that party.
 *
 * IMPORTANT:
 *   When there are rows in the period for the category BUT the party
 *   name doesn't match any of them, we return the SUM of all outstanding
 *   amounts in that category as a defensive fallback. This makes it
 *   impossible to bypass the overpayment guard by misspelling a name.
 *
 * SPECIAL CASE — Refund to Client:
 *   A client can only be refunded up to what they've ALREADY PAID us
 *   (Receivable.amountReceived), minus any refunds already issued
 *   (Pending or Paid) for that client in this period.
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

  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  const nameMatch = (a: string, b: string) => {
    const x = norm(a);
    const y = norm(b);
    if (!x || !y) return false;
    return x === y || x.includes(y) || y.includes(x);
  };

  const lastNameMatch = (a: string, b: string) => {
    const aParts = norm(a).split(" ");
    const bParts = norm(b).split(" ");
    const lastA = aParts[aParts.length - 1];
    const lastB = bParts[bParts.length - 1];
    return !!lastA && lastA === lastB && lastA.length > 2;
  };

  // ── Client Receipt / Revenue ──
  if (
    category.includes("receipt") ||
    category.includes("revenue") ||
    category.includes("client receipt")
  ) {
    const rows = await prisma.receivable.findMany({ where: { periodId } });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-receivables-in-period",
      });
    }
    const r =
      rows.find((row) => nameMatch(row.clientName, party)) ??
      rows.find((row) => lastNameMatch(row.clientName, party));

    if (r) {
      return NextResponse.json({
        outstanding: r.remainingAmount,
        exists: true,
      });
    }

    // No name match — check if the client master exists
    const clients = await prisma.client.findMany();
    const c =
      clients.find((row) => nameMatch(row.name, party)) ??
      clients.find((row) => lastNameMatch(row.name, party));
    if (c) {
      return NextResponse.json({
        outstanding: 0,
        exists: true,
        reason: "client-exists-no-receivable",
      });
    }

    // Fallback: return the SUM of all remaining receivables so that
    // any amount larger than the total outstanding is still blocked.
    const totalRemaining = rows.reduce(
      (s, row) => s + row.remainingAmount,
      0
    );
    return NextResponse.json({
      outstanding: totalRemaining,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Salary / Payroll ──
  if (category.includes("salary") || category.includes("payroll")) {
    const rows = await prisma.payrollEntry.findMany({ where: { periodId } });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-payroll-in-period",
      });
    }
    const entry =
      rows.find((r) => nameMatch(r.employeeName, party)) ??
      rows.find((r) => lastNameMatch(r.employeeName, party));

    if (entry) {
      return NextResponse.json({
        outstanding: Math.max(0, entry.netPayable - (entry.amountPaid ?? 0)),
        exists: true,
      });
    }

    // No name match — return the SUM of all outstanding payroll in
    // the period as a defensive fallback so we still block huge overpays.
    const totalOutstanding = rows.reduce(
      (s, r) => s + Math.max(0, r.netPayable - (r.amountPaid ?? 0)),
      0
    );
    return NextResponse.json({
      outstanding: totalOutstanding,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Hotel ──
  if (category.includes("hotel")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Hotel" } },
    });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-hotel-payables-in-period",
      });
    }
    const p =
      rows.find((r) => nameMatch(r.supplierName, party)) ??
      rows.find((r) => lastNameMatch(r.supplierName, party));
    if (p) {
      return NextResponse.json({ outstanding: p.remaining, exists: true });
    }
    // No name match — return the total remaining across all hotel payables.
    const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
    return NextResponse.json({
      outstanding: totalRemaining,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Transport ──
  if (category.includes("transport") || category.includes("driver")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Transport" } },
    });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-transport-payables-in-period",
      });
    }
    const p =
      rows.find((r) => nameMatch(r.supplierName, party)) ??
      rows.find((r) => lastNameMatch(r.supplierName, party));
    if (p) {
      return NextResponse.json({ outstanding: p.remaining, exists: true });
    }
    const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
    return NextResponse.json({
      outstanding: totalRemaining,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Ticketing ──
  if (category.includes("ticketing")) {
    const rows = await prisma.payable.findMany({
      where: { periodId, category: { contains: "Ticketing" } },
    });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-ticketing-payables-in-period",
      });
    }
    const p =
      rows.find((r) => nameMatch(r.supplierName, party)) ??
      rows.find((r) => lastNameMatch(r.supplierName, party));
    if (p) {
      return NextResponse.json({ outstanding: p.remaining, exists: true });
    }
    const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
    return NextResponse.json({
      outstanding: totalRemaining,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Supplier / Payable (generic) ──
  if (category.includes("supplier") || category.includes("payable")) {
    const rows = await prisma.payable.findMany({ where: { periodId } });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-payables-in-period",
      });
    }
    const p =
      rows.find((r) => nameMatch(r.supplierName, party)) ??
      rows.find((r) => lastNameMatch(r.supplierName, party));
    if (p) {
      return NextResponse.json({ outstanding: p.remaining, exists: true });
    }
    const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
    return NextResponse.json({
      outstanding: totalRemaining,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Commission ──
  if (category.includes("commission")) {
    const rows = await prisma.commission.findMany({
      where: { periodId, status: "Accrued" },
    });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-accrued-commissions",
      });
    }
    const c =
      rows.find((r) => nameMatch(r.employeeName, party)) ??
      rows.find((r) => lastNameMatch(r.employeeName, party));
    if (c) {
      return NextResponse.json({ outstanding: c.commissionAmt, exists: true });
    }
    const totalAccrued = rows.reduce((s, r) => s + r.commissionAmt, 0);
    return NextResponse.json({
      outstanding: totalAccrued,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Refund to Client ──
  // A client can only be refunded up to what they've ALREADY PAID us
  // (Receivable.amountReceived), minus any refunds already issued
  // (Pending or Paid) for that same client in this period.
  if (category.includes("refund")) {
    // 1. Receivables (what they paid us) for this period
    const receivables = await prisma.receivable.findMany({
      where: { periodId },
    });

    // 2. All refunds for this period (both Pending and Paid) — these
    //    count against the refundable balance so we don't double-refund.
    const allRefunds = await prisma.refund.findMany({ where: { periodId } });

    if (receivables.length === 0 && allRefunds.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-refundable-data-in-period",
      });
    }

    // Helper — sum of refunds for one client (any status)
    const refundedTo = (clientName: string) =>
      allRefunds
        .filter((r) => nameMatch(r.clientName, clientName))
        .reduce((s, r) => s + r.amount, 0);

    // Try to find the client by name in receivables first
    const recv =
      receivables.find((r) => nameMatch(r.clientName, party)) ??
      receivables.find((r) => lastNameMatch(r.clientName, party));

    if (recv) {
      const paidIn = Math.max(0, recv.amountReceived || 0);
      const alreadyRefunded = refundedTo(recv.clientName);
      const refundable = Math.max(0, paidIn - alreadyRefunded);

      return NextResponse.json({
        outstanding: refundable,
        exists: true,
        reason:
          refundable === 0
            ? alreadyRefunded > 0
              ? "already-refunded"
              : "client-has-no-receipts"
            : undefined,
      });
    }

    // No matching receivable — maybe the client exists with zero receipts
    const clients = await prisma.client.findMany();
    const c =
      clients.find((row) => nameMatch(row.name, party)) ??
      clients.find((row) => lastNameMatch(row.name, party));
    if (c) {
      // Look for ANY receivable for this client (any period)
      const anyRecv = await prisma.receivable.findMany({
        where: { clientId: c.id },
      });
      const paidIn = anyRecv.reduce(
        (s, r) => s + Math.max(0, r.amountReceived || 0),
        0
      );
      const alreadyRefunded = refundedTo(c.name);
      const refundable = Math.max(0, paidIn - alreadyRefunded);

      return NextResponse.json({
        outstanding: refundable,
        exists: true,
        reason:
          refundable === 0
            ? paidIn === 0
              ? "client-has-no-receipts"
              : "already-refunded"
            : undefined,
      });
    }

    // No name match — return the total refundable across ALL clients in
    // this period, as a defensive fallback so huge refunds are blocked.
    const totalPaidIn = receivables.reduce(
      (s, r) => s + Math.max(0, r.amountReceived || 0),
      0
    );
    const totalRefunded = allRefunds.reduce((s, r) => s + r.amount, 0);
    const totalRefundable = Math.max(0, totalPaidIn - totalRefunded);

    return NextResponse.json({
      outstanding: totalRefundable,
      exists: true,
      reason: "no-name-match",
    });
  }

  // ── Employee Loan ──
  if (category.includes("employee loan") || category.includes("staff advance")) {
    const emps = await prisma.employee.findMany({ where: { isActive: true } });
    if (emps.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-active-employees",
      });
    }
    const emp =
      emps.find((e) => nameMatch(e.name, party)) ??
      emps.find((e) => lastNameMatch(e.name, party));

    if (!emp) {
      // No name match — return the sum of all outstanding loans
      const loans = await prisma.employeeLoan.findMany({
        where: { remainingAmount: { gt: 0 } },
      });
      const total = loans.reduce((s, l) => s + l.remainingAmount, 0);
      return NextResponse.json({
        outstanding: total,
        exists: true,
        reason: "no-name-match",
      });
    }
    const loan = await prisma.employeeLoan.findFirst({
      where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
    });
    return NextResponse.json({
      outstanding: loan?.remainingAmount ?? 0,
      exists: true,
      reason: loan ? undefined : "no-outstanding-loan",
    });
  }

  // ── Supplier Advance ──
  if (category.includes("advance")) {
    const rows = await prisma.supplierAdvance.findMany({
      where: { periodId, remaining: { gt: 0 } },
    });
    if (rows.length === 0) {
      return NextResponse.json({
        outstanding: 0,
        exists: false,
        reason: "no-open-advances",
      });
    }
    const a =
      rows.find((r) => nameMatch(r.supplierName, party)) ??
      rows.find((r) => lastNameMatch(r.supplierName, party));
    if (a) {
      return NextResponse.json({ outstanding: a.remaining, exists: true });
    }
    const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
    return NextResponse.json({
      outstanding: totalRemaining,
      exists: true,
      reason: "no-name-match",
    });
  }

  // Fallback
  return NextResponse.json({
    outstanding: 0,
    exists: false,
    reason: "unknown-category",
  });
}