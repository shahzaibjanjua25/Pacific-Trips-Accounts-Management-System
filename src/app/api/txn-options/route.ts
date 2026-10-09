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
    // Hotel payments — return ALL hotels (paid + unpaid)
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
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

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
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("supplier") || category.includes("payable")) {
      const rows = await prisma.payable.findMany({
        where: periodId ? { periodId } : {},
        orderBy: [{ remaining: "desc" }, { supplierName: "asc" }],
      });
      const options: Option[] = rows.map((p) => ({
        label: `${p.supplierName} — ${p.category || "Other"} ${
          p.remaining > 0 ? `(owing ${p.remaining.toLocaleString()})` : "(fully paid)"
        }`,
        value: p.supplierName,
        remaining: p.remaining,
        id: p.id,
        entityType: "payable",
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("ticketing")) {
      const rows = await prisma.ticketing.findMany({
        where: periodId ? { periodId } : {},
        orderBy: { createdAt: "desc" },
      });
      const options: Option[] = rows.map((t) => ({
        label: `${t.airline || "Airline"} — ${t.clientName || "—"}`,
        value: t.airline || t.clientName || "Ticketing",
        remaining: 0,
        id: t.id,
        entityType: "ticketing",
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

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
        label: `${r.clientName} ${
          r.remainingAmount > 0
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
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("salary") || category.includes("payroll")) {
      const emps = await prisma.employee.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      const options: Option[] = emps.map((e) => ({
        label: `${e.name} (${e.role || "Staff"})`,
        value: e.name,
        remaining: 0,
        id: e.id,
        entityType: "employee",
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("commission")) {
      const commissions = await prisma.commission.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          status: "Accrued",
        },
        orderBy: { employeeName: "asc" },
      });
      const options: Option[] = commissions.map((c) => ({
        label: `${c.employeeName} — commission ${c.commissionAmt.toLocaleString()}`,
        value: c.employeeName,
        remaining: c.commissionAmt,
        id: c.id,
        entityType: "commission",
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("refund")) {
      const refunds = await prisma.refund.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          status: "Pending",
        },
      });
      const options: Option[] = refunds.map((r) => ({
        label: `${r.clientName} — refund ${r.amount.toLocaleString()}`,
        value: r.clientName,
        remaining: r.amount,
        id: r.id,
        entityType: "refund",
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("advance")) {
      const emps = await prisma.employee.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      const options: Option[] = emps.map((e) => ({
        label: `${e.name} (${e.role || "Staff"})`,
        value: e.name,
        remaining: 0,
        id: e.id,
        entityType: "employee",
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    return NextResponse.json([{ label: "Other…", value: "__other__", remaining: 0 }]);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}