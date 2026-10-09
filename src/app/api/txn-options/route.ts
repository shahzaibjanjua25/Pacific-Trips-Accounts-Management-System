import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { getSessionUserId } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const category = (req.nextUrl.searchParams.get("category") || "").toLowerCase();
  const periodId = req.nextUrl.searchParams.get("periodId");

  try {
    if (category.includes("hotel")) {
      const hotels = await prisma.hotelBooking.findMany({
        where: periodId
          ? { periodId, remaining: { gt: 0 } }
          : { remaining: { gt: 0 } },
        orderBy: { hotelName: "asc" },
      });
      // also from payables hotel category
      const pay = await prisma.payable.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          category: { contains: "Hotel" },
          remaining: { gt: 0 },
        },
      });
      const names = new Set<string>();
      const options: { label: string; value: string; remaining: number; id?: string }[] = [];
      for (const h of hotels) {
        if (!names.has(h.hotelName)) {
          names.add(h.hotelName);
          options.push({
            label: `${h.hotelName} (owing ${h.remaining.toLocaleString()})`,
            value: h.hotelName,
            remaining: h.remaining,
            id: h.id,
          });
        }
      }
      for (const p of pay) {
        if (!names.has(p.supplierName)) {
          names.add(p.supplierName);
          options.push({
            label: `${p.supplierName} (owing ${p.remaining.toLocaleString()})`,
            value: p.supplierName,
            remaining: p.remaining,
            id: p.id,
          });
        }
      }
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("transport") || category.includes("driver")) {
      const jobs = await prisma.transportJob.findMany({
        where: periodId ? { periodId, remaining: { gt: 0 } } : { remaining: { gt: 0 } },
      });
      const pay = await prisma.payable.findMany({
        where: {
          ...(periodId ? { periodId } : {}),
          category: { contains: "Transport" },
          remaining: { gt: 0 },
        },
      });
      const names = new Set<string>();
      const options: { label: string; value: string; remaining: number }[] = [];
      for (const t of jobs) {
        const n = t.driverName || "Unknown driver";
        if (!names.has(n)) {
          names.add(n);
          options.push({
            label: `${n}${t.vehicle ? ` / ${t.vehicle}` : ""} (owing ${t.remaining.toLocaleString()})`,
            value: n,
            remaining: t.remaining,
          });
        }
      }
      for (const p of pay) {
        if (!names.has(p.supplierName)) {
          names.add(p.supplierName);
          options.push({
            label: `${p.supplierName} (owing ${p.remaining.toLocaleString()})`,
            value: p.supplierName,
            remaining: p.remaining,
          });
        }
      }
      options.push({ label: "Other…", value: "__other__", remaining: 0 });
      return NextResponse.json(options);
    }

    if (category.includes("supplier") || category.includes("payable")) {
      const pay = await prisma.payable.findMany({
        where: periodId ? { periodId, remaining: { gt: 0 } } : { remaining: { gt: 0 } },
        orderBy: { supplierName: "asc" },
      });
      const options = pay.map((p) => ({
        label: `${p.supplierName} — ${p.category} (owing ${p.remaining.toLocaleString()})`,
        value: p.supplierName,
        remaining: p.remaining,
        id: p.id,
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0, id: "" });
      return NextResponse.json(options);
    }

    if (category.includes("receipt") || category.includes("revenue") || category.includes("client")) {
      const recv = await prisma.receivable.findMany({
        where: periodId
          ? { periodId, remainingAmount: { gt: 0 } }
          : { remainingAmount: { gt: 0 } },
        orderBy: { clientName: "asc" },
      });
      const options = recv.map((r) => ({
        label: `${r.clientName} (due ${r.remainingAmount.toLocaleString()})`,
        value: r.clientName,
        remaining: r.remainingAmount,
        id: r.id,
      }));
      const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
      const have = new Set(options.map((o) => o.value));
      for (const c of clients) {
        if (!have.has(c.name)) {
          options.push({ label: c.name, value: c.name, remaining: 0, id: c.id });
        }
      }
      options.push({ label: "Other…", value: "__other__", remaining: 0, id: "" });
      return NextResponse.json(options);
    }

    if (category.includes("salary") || category.includes("commission") || category.includes("payroll")) {
      const emps = await prisma.employee.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      const options = emps.map((e) => ({
        label: `${e.name} (${e.role})`,
        value: e.name,
        remaining: 0,
        id: e.id,
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0, id: "" });
      return NextResponse.json(options);
    }

    if (category.includes("refund")) {
      const refunds = await prisma.refund.findMany({
        where: periodId ? { periodId, status: "Pending" } : { status: "Pending" },
      });
      const options = refunds.map((r) => ({
        label: `${r.clientName} (refund ${r.amount.toLocaleString()})`,
        value: r.clientName,
        remaining: r.amount,
        id: r.id,
      }));
      options.push({ label: "Other…", value: "__other__", remaining: 0, id: "" });
      return NextResponse.json(options);
    }

    // default: empty + Other
    return NextResponse.json([{ label: "Other…", value: "__other__", remaining: 0 }]);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
