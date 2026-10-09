import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { formatPKR } from "@/lib/utils";
import { ArrowLeft, Phone, Mail, User } from "lucide-react";
import { ClientLedgerPanel } from "./ClientLedgerPanel";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  let periods = await listPeriods();
  let periodId = sp.period;
  if (!periodId || periods.length === 0) {
    const now = new Date();
    const c = await getOrCreatePeriod(now.getFullYear(), now.getMonth() + 1);
    periodId = c.id;
    periods = await listPeriods();
  }
  const current = periods.find((p) => p.id === periodId) ?? periods[0];

  const [ledgerRows, receivables, trips] = await Promise.all([
    prisma.clientLedger.findMany({
      where: { clientId: id },
      orderBy: { tourDate: "asc" },
    }),
    prisma.receivable.findMany({ where: { periodId: current.id, clientId: id } }),
    prisma.trip.findMany({ where: { periodId: current.id, clientId: id } }),
  ]);

  const totalPaid = receivables.reduce((s, r) => s + r.amountReceived, 0);
  const totalDue = receivables.reduce((s, r) => s + r.remainingAmount, 0);
  const totalPackage = receivables.reduce((s, r) => s + r.totalPackage, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link
            href={`/clients?period=${current.id}`}
            className="mt-1 p-2 rounded-lg hover:bg-slate-100"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <User size={22} className="text-emerald-600" />
              {client.name}
            </h1>
            <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-3">
              {client.phone && (
                <span className="flex items-center gap-1">
                  <Phone size={13} /> {client.phone}
                </span>
              )}
              {client.email && (
                <span className="flex items-center gap-1">
                  <Mail size={13} /> {client.email}
                </span>
              )}
              {client.contact && <span>Ref: {client.contact}</span>}
            </div>
          </div>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Stat title="Total Package" value={totalPackage} tone="slate" />
        <Stat title="Amount Paid" value={totalPaid} tone="emerald" />
        <Stat title="Amount Due" value={totalDue} tone={totalDue > 0 ? "red" : "slate"} />
        <Stat
          title="Ledger Balance"
          value={ledgerRows.reduce((s, r) => s + (r.debit || 0) - (r.credit || 0), 0)}
          tone="sky"
        />
      </div>

      {trips.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h2 className="font-semibold text-slate-800 mb-3">Trips ({trips.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase border-b">
                <th className="py-1.5">Trip Ref</th>
                <th className="py-1.5">Destination</th>
                <th className="py-1.5">Start</th>
                <th className="py-1.5">End</th>
                <th className="py-1.5 text-right">Revenue</th>
                <th className="py-1.5 text-right">Net Profit</th>
                <th className="py-1.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-1.5">{t.tripRef || "—"}</td>
                  <td className="py-1.5">{t.destination || "—"}</td>
                  <td className="py-1.5">{t.startDate ? new Date(t.startDate).toLocaleDateString("en-GB") : "—"}</td>
                  <td className="py-1.5">{t.endDate ? new Date(t.endDate).toLocaleDateString("en-GB") : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatPKR(t.packageRevenue)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatPKR(t.netProfit)}</td>
                  <td className="py-1.5">{t.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ClientLedgerPanel
        clientId={client.id}
        clientName={client.name}
        rows={ledgerRows.map((r) => ({
          id: r.id,
          tourDate: r.tourDate ? r.tourDate.toISOString() : null,
          description: r.description,
          category: r.category,
          subCategory: r.subCategory,
          hotel: r.hotel,
          debit: r.debit,
          credit: r.credit,
          status: r.status,
          receiptRef: r.receiptRef,
          enteredBy: r.enteredBy,
          notes: r.notes,
        }))}
      />
    </div>
  );
}

function Stat({
  title, value, tone,
}: {
  title: string; value: number; tone: "slate" | "emerald" | "red" | "sky";
}) {
  const map = {
    slate: "border-slate-200 bg-white text-slate-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    red: "border-red-200 bg-red-50 text-red-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return (
    <div className={`rounded-lg border p-4 ${map[tone]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{title}</p>
      <p className="text-xl font-bold mt-1 tabular-nums">{formatPKR(value)}</p>
    </div>
  );
}