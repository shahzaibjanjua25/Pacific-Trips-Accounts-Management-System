import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * POST /api/balance-sheet/sync
 * Body: { periodId: string; sections?: ("Asset"|"Liability"|"Equity")[] }
 *
 * Re-seeds the auto-derived lines from live books, WITHOUT touching
 * user-added manual lines. We match by (section, label) so any line whose
 * label matches a known derived name is updated; otherwise a new line is
 * created. Manual lines with unknown labels are left alone.
 */
export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const periodId = body.periodId as string;
    if (!periodId) {
      return NextResponse.json({ error: "periodId required" }, { status: 400 });
    }
    const sections: string[] = Array.isArray(body.sections) && body.sections.length
      ? body.sections
      : ["Asset", "Liability", "Equity"];

    const [banks, receivables, payables, assets, liabilities, loans, existing] =
      await Promise.all([
        prisma.bankBalance.findMany(),
        prisma.receivable.findMany({ where: { periodId } }),
        prisma.payable.findMany({ where: { periodId } }),
        prisma.asset.findMany(),
        prisma.liability.findMany({ where: { periodId } }),
        prisma.employeeLoan.findMany({ where: { remainingAmount: { gt: 0 } } }),
        prisma.balanceSheetLine.findMany({ where: { periodId } }),
      ]);

    const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
    const recvTotal = receivables.reduce((s, r) => s + r.remainingAmount, 0);
    const payTotal = payables.reduce((s, p) => s + p.remaining, 0);
    const assetTotal = assets.reduce((s, a) => s + a.purchaseCost, 0);
    const liabTotal = liabilities.reduce((s, l) => s + l.outstanding, 0);
    const loanTotal = loans.reduce((s, l) => s + l.remainingAmount, 0);

    const derived = [
      { section: "Asset", label: "Bank & Cash", amount: bankTotal, sortOrder: 10 },
      { section: "Asset", label: "Accounts Receivable", amount: recvTotal, sortOrder: 20 },
      { section: "Asset", label: "Employee Loans Receivable", amount: loanTotal, sortOrder: 30 },
      { section: "Asset", label: "Fixed Assets (at cost)", amount: assetTotal, sortOrder: 40 },
      { section: "Liability", label: "Accounts Payable", amount: payTotal, sortOrder: 10 },
      { section: "Liability", label: "Other Liabilities", amount: liabTotal, sortOrder: 20 },
    ];

    let updated = 0;
    let created = 0;

    for (const d of derived) {
      if (!sections.includes(d.section)) continue;
      const match = existing.find(
        (e) => e.section === d.section && e.label === d.label
      );
      if (match) {
        await prisma.balanceSheetLine.update({
          where: { id: match.id },
          data: { amount: d.amount, sortOrder: d.sortOrder },
        });
        updated++;
      } else {
        await prisma.balanceSheetLine.create({
          data: { periodId, ...d },
        });
        created++;
      }
    }

    // Owner Equity: if it exists in the Equity section, recompute as residual
    if (sections.includes("Equity")) {
      const equityLines = await prisma.balanceSheetLine.findMany({
        where: { periodId, section: "Equity" },
      });
      const ownerLine = equityLines.find(
        (e) => e.label === "Owner Equity / Capital"
      );
      const residual = Math.max(
        0,
        bankTotal + recvTotal + loanTotal + assetTotal - payTotal - liabTotal
      );
      if (ownerLine) {
        await prisma.balanceSheetLine.update({
          where: { id: ownerLine.id },
          data: { amount: residual },
        });
        updated++;
      } else {
        await prisma.balanceSheetLine.create({
          data: {
            periodId,
            section: "Equity",
            label: "Owner Equity / Capital",
            amount: residual,
            sortOrder: 10,
          },
        });
        created++;
      }
    }

    return NextResponse.json({
      ok: true,
      updated,
      created,
      message: `${updated} line(s) updated, ${created} line(s) created.`,
    });
  } catch (e) {
    console.error("[balance-sheet:sync]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}