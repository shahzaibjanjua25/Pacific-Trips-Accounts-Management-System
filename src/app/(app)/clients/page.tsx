import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { ClientsTable } from "./ClientsTable";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  let periods = await listPeriods();
  let periodId = params.period;
  if (!periodId || periods.length === 0) {
    const now = new Date();
    const c = await getOrCreatePeriod(now.getFullYear(), now.getMonth() + 1);
    periodId = c.id;
    periods = await listPeriods();
  }
  const current = periods.find((p) => p.id === periodId) ?? periods[0];

  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const receivables = await prisma.receivable.findMany({
    where: { periodId: current.id },
  });
  const ledgers = await prisma.clientLedger.findMany();

  type Row = {
    id: string;
    name: string;
    phone: string | null;
    contact: string | null;
    email: string | null;
    notes: string | null;
    totalPackage: number;
    amountPaid: number;
    amountDue: number;
    status: string;
    tripInfo: string;
  };

  const rows: Row[] = clients.map((c) => {
    const recv = receivables.filter(
      (r) => r.clientId === c.id || r.clientName === c.name
    );
    const ledger = ledgers.filter((l) => l.clientId === c.id);

    // Prefer the Receivable row when it exists — it's the source of truth
    let totalPackage = 0;
    let amountPaid = 0;
    let amountDue = 0;
    let tripInfo = "—";
    let status = "—";

    if (recv.length > 0) {
      totalPackage = recv.reduce((s, r) => s + r.totalPackage, 0);
      amountPaid = recv.reduce((s, r) => s + r.amountReceived, 0);
      amountDue = recv.reduce((s, r) => s + r.remainingAmount, 0);
      tripInfo =
        recv.find((r) => r.tripDates)?.tripDates ||
        recv.find((r) => r.destination)?.destination ||
        "—";
      status = amountDue <= 0 && amountPaid > 0 ? "Settled" : amountPaid > 0 ? "Partial" : "Open";
    } else if (ledger.length > 0) {
      // Fall back to ledger sums
      const paidRows = ledger.filter(
        (l) =>
          l.hotel === "Payment" ||
          (l.category || "").toLowerCase().includes("receipt") ||
          (l.category || "").toLowerCase().includes("revenue")
      );
      const dueRows = ledger.filter(
        (l) =>
          l.hotel === "Receivables" ||
          (l.category || "").toLowerCase().includes("receivable")
      );
      amountPaid = paidRows.reduce((s, l) => s + (l.debit || 0), 0);
      amountDue = dueRows.reduce((s, l) => s + (l.debit || 0), 0);
      totalPackage = amountPaid + amountDue;
      tripInfo =
        ledger.find((l) => l.description)?.description ||
        ledger.find((l) => l.hotel)?.hotel ||
        "—";
      status = amountDue <= 0 && amountPaid > 0 ? "Settled" : amountPaid > 0 ? "Partial" : "Open";
    }

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      contact: c.contact,
      email: c.email,
      notes: c.notes,
      totalPackage,
      amountPaid,
      amountDue,
      status,
      tripInfo,
    };
  });

  // Receivable-only clients (no Client master row)
  for (const r of receivables) {
    if (r.clientId) continue;
    if (clients.some((c) => c.name === r.clientName)) continue;
    if (rows.some((x) => x.name === r.clientName)) continue;
    rows.push({
      id: `recv-${r.id}`,
      name: r.clientName,
      phone: r.contact,
      contact: r.contact,
      email: null,
      notes: null,
      totalPackage: r.totalPackage,
      amountPaid: r.amountReceived,
      amountDue: r.remainingAmount,
      status: r.status || "Open",
      tripInfo: r.tripDates || r.destination || "—",
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-slate-500">
            Click a client to open their individual ledger (debit / credit balance sheet)
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <ClientsTable rows={rows} periodId={current.id} />
    </div>
  );
}