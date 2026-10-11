import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

type Option = {
  label: string;
  value: string;
  remaining: number;
  id?: string;
  entityType?: string;
};

function withOwing(label: string, owing: number, fully = false): string {
  if (fully) return `${label} (fully paid)`;
  return `${label} (owing ${owing.toLocaleString()})`;
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const category = (req.nextUrl.searchParams.get("category") || "").toLowerCase();
  const periodId = req.nextUrl.searchParams.get("periodId");

  try {
    // ── Hotel payments — return ALL hotels (paid + unpaid) ──
    if (category.includes("hotel")) {
      const rows = await prisma.payable.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          category: { contains: "Hotel" },
        },
        orderBy: [{ remaining: "desc" }, { supplierName: "asc" }],
      });

      const seen = new Set<string>();
      const options: Option[] = [];
      for (const p of rows) {
        if (seen.has(p.supplierName)) continue;
        seen.add(p.supplierName);
        options.push({
          label: withOwing(p.supplierName, p.remaining, p.remaining <= 0),
          value: p.supplierName,
          remaining: p.remaining,
          id: p.id,
          entityType: "payable",
        });
      }
      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Transport / Driver ──
    if (category.includes("transport") || category.includes("driver")) {
      const rows = await prisma.payable.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          category: { contains: "Transport" },
        },
        orderBy: [{ remaining: "desc" }, { supplierName: "asc" }],
      });
      const options: Option[] = rows.map((p) => ({
        label: withOwing(p.supplierName, p.remaining, p.remaining <= 0),
        value: p.supplierName,
        remaining: p.remaining,
        id: p.id,
        entityType: "payable",
      }));
      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Ticketing ──
    if (category.includes("ticketing")) {
      const rows = await prisma.ticketing.findMany({
        where: periodId ? { periodId } : {},
        orderBy: { createdAt: "desc" },
      });
      const options: Option[] = rows.map((t) => ({
        label: `${t.airline || "Airline"} - ${t.clientName || "-"}`,
        value: t.airline || t.clientName || "Ticketing",
        remaining: 0,
        id: t.id,
        entityType: "ticketing",
      }));
      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Supplier / Payable (generic) ──
    if (category.includes("supplier") || category.includes("payable")) {
      const rows = await prisma.payable.findMany({
        where: periodId ? { periodId } : {},
        orderBy: [{ remaining: "desc" }, { supplierName: "asc" }],
      });
      const options: Option[] = rows.map((p) => ({
        label: `${p.supplierName} - ${p.category || "Other"} ${p.remaining > 0
            ? `(owing ${p.remaining.toLocaleString()})`
            : "(fully paid)"
          }`,
        value: p.supplierName,
        remaining: p.remaining,
        id: p.id,
        entityType: "payable",
      }));
      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Client receipt / Revenue ──
    if (
      category.includes("receipt") ||
      category.includes("revenue") ||
      category.includes("client receipt")
    ) {
      const recv = await prisma.receivable.findMany({
        where: periodId ? { periodId } : {},
        orderBy: [{ remainingAmount: "desc" }, { clientName: "asc" }],
      });
      const options: Option[] = recv.map((r) => ({
        label: `${r.clientName} ${r.remainingAmount > 0
            ? `(due ${r.remainingAmount.toLocaleString()})`
            : "(fully paid)"
          }`,
        value: r.clientName,
        remaining: r.remainingAmount,
        id: r.id,
        entityType: "receivable",
      }));

      const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
      const have = new Set(options.map((o) => o.value));
      for (const c of clients) {
        if (!have.has(c.name)) {
          options.push({
            label: c.name,
            value: c.name,
            remaining: 0,
            id: c.id,
            entityType: "client",
          });
        }
      }
      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Salary / Payroll ──
    if (category.includes("salary") || category.includes("payroll")) {
      const emps = await prisma.employee.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      const payrollRows = periodId
        ? await prisma.payrollEntry.findMany({
          where: {
            periodId,
            status: { in: ["Pending", "Partial"] },
          },
        })
        : [];
      const remainingByName = new Map<string, number>();
      for (const p of payrollRows) {
        const left = Math.max(0, p.netPayable - (p.amountPaid ?? 0));
        remainingByName.set(p.employeeName, left);
      }
      const options: Option[] = emps.map((e) => {
        const remaining = remainingByName.get(e.name) ?? 0;
        return {
          label:
            remaining > 0
              ? withOwing(`${e.name} (${e.role || "Staff"})`, remaining)
              : `${e.name} (${e.role || "Staff"})`,
          value: e.name,
          remaining,
          id: e.id,
          entityType: "employee",
        };
      });
      options.sort((a, b) => b.remaining - a.remaining);
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Commission Payment ──
    // List employees who have an Accrued commission (unpaid) for this period.
    if (category.includes("commission")) {
      const commissions = await prisma.commission.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          status: "Accrued",
        },
        orderBy: [{ commissionAmt: "desc" }, { employeeName: "asc" }],
      });

      const options: Option[] = commissions.map((c) => ({
        label: `${c.employeeName} — commission owing ${c.commissionAmt.toLocaleString()}`,
        value: c.employeeName,
        remaining: c.commissionAmt,
        id: c.id,
        entityType: "commission",
      }));

      // Also include Sales staff who might not yet have a Commission row
      const salesStaff = await prisma.employee.findMany({
        where: { isActive: true, role: "Sales" },
        orderBy: { name: "asc" },
      });
      const have = new Set(options.map((o) => o.value));
      for (const e of salesStaff) {
        if (!have.has(e.name)) {
          options.push({
            label: `${e.name} (no commission accrued yet)`,
            value: e.name,
            remaining: 0,
            id: e.id,
            entityType: "employee",
          });
        }
      }

      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Refund to Client ──
    // List every client with a Pending refund, plus every client (for new refunds).
    // ── Refund to Client ──
    // List clients that actually have money they can be refunded.
    if (category.includes("refund")) {
      const [receivables, refunds] = await Promise.all([
        prisma.receivable.findMany({
          where: periodId ? { periodId } : {},
        }),
        prisma.refund.findMany({
          where: periodId ? { periodId } : {},
        }),
      ]);

      const paidBy = new Map<string, number>();
      const refundedBy = new Map<string, number>();

      for (const r of receivables) {
        const k = (r.clientName || "").trim();
        if (!k) continue;
        paidBy.set(k, (paidBy.get(k) ?? 0) + Math.max(0, r.amountReceived || 0));
      }
      for (const r of refunds) {
        const k = (r.clientName || "").trim();
        if (!k) continue;
        refundedBy.set(k, (refundedBy.get(k) ?? 0) + Math.max(0, r.amount || 0));
      }

      // Union of names — from receivables, from clients master, and from refunds
      const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
      const names = new Set<string>();
      receivables.forEach((r) => r.clientName && names.add(r.clientName));
      refunds.forEach((r) => r.clientName && names.add(r.clientName));
      clients.forEach((c) => names.add(c.name));

      const options: Option[] = Array.from(names)
        .map((name) => {
          const paid = paidBy.get(name) ?? 0;
          const refunded = refundedBy.get(name) ?? 0;
          const refundable = Math.max(0, paid - refunded);
          return {
            label:
              refundable > 0
                ? `${name} — refundable ${refundable.toLocaleString()} (paid ${paid.toLocaleString()})`
                : paid === 0
                  ? `${name} — no receipts yet`
                  : `${name} — fully refunded (${refunded.toLocaleString()})`,
            value: name,
            remaining: refundable,
            entityType: "client",
          };
        })
        // Sort: refundable first (desc), then fully-refunded, then no-receipts
        .sort((a, b) => b.remaining - a.remaining);

      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Office Expense ──
    // List standard expense sub-categories + any vendors already used.
    if (category.includes("office")) {
      const STANDARD = [
        "Rent",
        "Electricity",
        "Internet/Telephone",
        "Maintenance",
        "Saving",
        "Supplies",
        "Water",
        "Gas",
        "Stationery",
        "Other",
      ];
      const options: Option[] = STANDARD.map((s) => ({
        label: s,
        value: s,
        remaining: 0,
        entityType: "subcategory",
      }));

      // Add previously used vendors
      const vendors = await prisma.officeExpense.findMany({
        where: periodId ? { periodId } : {},
        select: { vendor: true, category: true },
      });
      const seen = new Set(options.map((o) => o.value));
      for (const v of vendors) {
        if (!v.vendor) continue;
        if (seen.has(v.vendor)) continue;
        seen.add(v.vendor);
        options.push({
          label: `${v.vendor} (vendor — ${v.category})`,
          value: v.vendor,
          remaining: 0,
          entityType: "vendor",
        });
      }

      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Marketing Expense ──
    // List standard channels + existing vendors.
    if (category.includes("marketing")) {
      const CHANNELS = [
        "Meta Ads",
        "Google Ads",
        "TikTok Ads",
        "YouTube",
        "Influencer",
        "Print",
        "Events",
        "Other",
      ];
      const options: Option[] = CHANNELS.map((c) => ({
        label: c,
        value: c,
        remaining: 0,
        entityType: "subcategory",
      }));

      const vendors = await prisma.marketingExpense.findMany({
        where: periodId ? { periodId } : {},
        select: { vendor: true, channel: true },
      });
      const seen = new Set(options.map((o) => o.value));
      for (const v of vendors) {
        if (!v.vendor) continue;
        if (seen.has(v.vendor)) continue;
        seen.add(v.vendor);
        options.push({
          label: `${v.vendor} (vendor — ${v.channel || "Marketing"})`,
          value: v.vendor,
          remaining: 0,
          entityType: "vendor",
        });
      }

      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Supplier Advance — list SUPPLIERS ──
    if (category.includes("advance") && !category.includes("employee")) {
      const rows = await prisma.payable.findMany({
        where: periodId ? { periodId } : {},
        orderBy: { supplierName: "asc" },
      });
      const seen = new Set<string>();
      const options: Option[] = [];
      for (const p of rows) {
        if (seen.has(p.supplierName)) continue;
        seen.add(p.supplierName);
        options.push({
          label: `${p.supplierName} (${p.category || "Supplier"})`,
          value: p.supplierName,
          remaining: p.remaining,
          id: p.id,
          entityType: "payable",
        });
      }
      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Employee Loan ──
    if (category.includes("employee loan") || category.includes("staff advance")) {
      const emps = await prisma.employee.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        include: { loans: true },
      });
      const options: Option[] = emps.map((e) => {
        const loan = e.loans?.[0];
        return {
          label: loan
            ? `${e.name} (${e.role || "Staff"}) — loan remaining ${loan.remainingAmount.toLocaleString()}`
            : `${e.name} (${e.role || "Staff"})`,
          value: e.name,
          remaining: loan?.remainingAmount ?? 0,
          id: e.id,
          entityType: "employee",
        };
      });
      options.sort((a, b) => b.remaining - a.remaining);
      options.push({ label: "Other...", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    // ── Fallback ──
    return NextResponse.json([
      { label: "Other...", value: "__other__", remaining: 0 },
    ]);
  } catch (e) {
    console.error("[txn-options]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}