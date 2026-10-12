import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

type LookupKey =
  | "clients"
  | "employees"
  | "salesEmployees"
  | "allEmployees"
  | "hotels"
  | "drivers"
  | "suppliers"
  | "airlines"
  | "vendors"
  | "accounts"
  | "liabilityTypes"
  | "assetCategories";

type LookupItem = { value: string; label: string; meta?: string };

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const key = req.nextUrl.searchParams.get("key") as LookupKey | null;
  const periodId = req.nextUrl.searchParams.get("periodId");

  if (!key) {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }

  try {
    const items = await loadLookup(key, periodId);
    return NextResponse.json(items);
  } catch (e) {
    console.error(`[lookup:${key}]`, e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

async function loadLookup(key: LookupKey, periodId: string | null): Promise<LookupItem[]> {
  switch (key) {
    case "clients": {
      const rows = await prisma.client.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true },
      });
      // Also include receivable-only names
      const recvNames = periodId
        ? await prisma.receivable.findMany({
            where: { periodId, clientId: null },
            select: { clientName: true },
            distinct: ["clientName"],
          })
        : [];
      const out: LookupItem[] = rows.map((c) => ({
        value: c.name,
        label: c.name,
        meta: c.phone ?? undefined,
      }));
      const have = new Set(out.map((o) => o.value));
      for (const r of recvNames) {
        if (!have.has(r.clientName)) {
          out.push({ value: r.clientName, label: r.clientName, meta: "no master" });
        }
      }
      return out.sort((a, b) => a.label.localeCompare(b.label));
    }

    case "employees":
    case "allEmployees": {
      const rows = await prisma.employee.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, role: true },
      });
      return rows.map((e) => ({
        value: e.name,
        label: e.name,
        meta: e.role ?? "Staff",
      }));
    }

    case "salesEmployees": {
      // Team Lead does not close sales directly — exclude from attribution dropdowns
      const TEAM_LEAD_KEYWORDS = ["ahmad", "amad", "ammar"];
      const rows = await prisma.employee.findMany({
        where: { isActive: true, role: "Sales" },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });
      return rows
        .filter(
          (e) =>
            !TEAM_LEAD_KEYWORDS.some((k) => e.name.toLowerCase().includes(k))
        )
        .map((e) => ({ value: e.name, label: e.name }));
    }

    case "hotels": {
      const rows = await prisma.payable.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          category: { contains: "Hotel" },
        },
        orderBy: { supplierName: "asc" },
        select: { supplierName: true },
        distinct: ["supplierName"],
      });
      // Also include hotel booking names that may not have a payable yet
      const bookings = await prisma.hotelBooking.findMany({
        where: periodId ? { periodId } : {},
        select: { hotelName: true },
        distinct: ["hotelName"],
      });
      const names = new Set<string>();
      rows.forEach((r) => names.add(r.supplierName));
      bookings.forEach((b) => names.add(b.hotelName));
      return Array.from(names)
        .sort()
        .map((n) => ({ value: n, label: n }));
    }

    case "drivers": {
      const rows = await prisma.transportJob.findMany({
        where: periodId ? { periodId } : {},
        select: { driverName: true },
        distinct: ["driverName"],
      });
      const payables = await prisma.payable.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          category: { contains: "Transport" },
        },
        select: { supplierName: true },
        distinct: ["supplierName"],
      });
      const names = new Set<string>();
      rows.forEach((r) => r.driverName && names.add(r.driverName));
      payables.forEach((p) => names.add(p.supplierName));
      return Array.from(names)
        .sort()
        .map((n) => ({ value: n, label: n }));
    }

    case "suppliers": {
      const rows = await prisma.payable.findMany({
        where: periodId ? { periodId } : {},
        select: { supplierName: true, category: true },
        distinct: ["supplierName"],
      });
      return rows
        .map((r) => ({
          value: r.supplierName,
          label: r.supplierName,
          meta: r.category ?? undefined,
        }))
        .sort((a, b) => a.label.localeCompare(b.label));
    }

    case "airlines": {
      const rows = await prisma.ticketing.findMany({
        where: periodId ? { periodId } : {},
        select: { airline: true },
        distinct: ["airline"],
      });
      const names = rows
        .map((r) => r.airline)
        .filter((a): a is string => !!a && a.length > 0);
      return Array.from(new Set(names))
        .sort()
        .map((n) => ({ value: n, label: n }));
    }

    case "vendors": {
      const [office, marketing] = await Promise.all([
        prisma.officeExpense.findMany({
          where: periodId ? { periodId } : {},
          select: { vendor: true },
          distinct: ["vendor"],
        }),
        prisma.marketingExpense.findMany({
          where: periodId ? { periodId } : {},
          select: { vendor: true },
          distinct: ["vendor"],
        }),
      ]);
      const names = new Set<string>();
      office.forEach((o) => o.vendor && names.add(o.vendor));
      marketing.forEach((m) => m.vendor && names.add(m.vendor));
      return Array.from(names)
        .sort()
        .map((n) => ({ value: n, label: n }));
    }

    case "accounts": {
      const rows = await prisma.bankBalance.findMany({
        orderBy: { accountName: "asc" },
        select: { accountName: true },
      });
      return rows.map((b) => ({ value: b.accountName, label: b.accountName }));
    }

    case "liabilityTypes": {
      const rows = await prisma.liability.findMany({
        where: periodId ? { periodId } : {},
        select: { liabilityType: true },
        distinct: ["liabilityType"],
      });
      const types = rows.map((r) => r.liabilityType).filter(Boolean);
      return Array.from(new Set(types))
        .sort()
        .map((t) => ({ value: t, label: t }));
    }

    case "assetCategories": {
      return [
        "Camera",
        "Laptop",
        "Phone",
        "Furniture",
        "Vehicle",
        "Other",
      ].map((c) => ({ value: c, label: c }));
    }

    default:
      return [];
  }
}