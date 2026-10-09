import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { formatPKR } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

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
  const trips = await prisma.trip.findMany({ where: { periodId: current.id } });
  const ledgers = await prisma.clientLedger.findMany();

  type Row = {
    id: string;
    name: string;
    phone: string | null;
    contact: string | null;
    amountPaid: number;
    amountDue: number;
    status: string;
    tripInfo: string;
  };

  const rows: Row[] = clients.map((c) => {
    const recv = receivables.filter((r) => r.clientId === c.id || r.clientName === c.name);
    const trip = trips.find((t) => t.clientName === c.name);
    const ledger = ledgers.filter((l) => l.clientId === c.id);
    const amountPaid =
      recv.reduce((s, r) => s + r.amountReceived, 0) ||
      ledger.reduce((s, l) => s + (l.debit || 0), 0);
    const amountDue =
      recv.reduce((s, r) => s + r.remainingAmount, 0) ||
      Math.max(0, ledger.reduce((s, l) => s + (l.credit || 0) - (l.debit || 0), 0));
    let status = trip?.status || "—";
    if (recv.some((r) => r.status === "Settled") && amountDue <= 0) status = "Completed";
    else if (recv.some((r) => r.remainingAmount > 0)) status = status === "—" ? "Ongoing" : status;

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      contact: c.contact,
      amountPaid,
      amountDue,
      status,
      tripInfo: trip?.destination || recv[0]?.tripDates || recv[0]?.destination || "—",
    };
  });

  // Also show receivable-only clients without client master
  for (const r of receivables) {
    if (r.clientId) continue;
    if (clients.some((c) => c.name === r.clientName)) continue;
    if (rows.some((x) => x.name === r.clientName)) continue;
    rows.push({
      id: `recv-${r.id}`,
      name: r.clientName,
      phone: r.contact,
      contact: r.contact,
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

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-500 text-sm">
          No clients yet. Run seed or add from Settings / Receivables.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                {["Client Name", "Phone", "Trip / Package", "Amount Paid", "Amount Due", "Status", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const href = r.id.startsWith("recv-")
                  ? `/clients?period=${current.id}`
                  : `/clients/${r.id}?period=${current.id}`;
                const clickable = !r.id.startsWith("recv-");
                const content = (
                  <>
                    <td className="px-3 py-3 font-medium text-slate-900">{r.name}</td>
                    <td className="px-3 py-3 text-slate-600">{r.phone || r.contact || "—"}</td>
                    <td className="px-3 py-3 max-w-[180px] truncate">{r.tripInfo}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                      {formatPKR(r.amountPaid)}
                    </td>
                    <td
                      className={`px-3 py-3 text-right tabular-nums font-medium ${
                        r.amountDue > 0 ? "text-red-600" : "text-slate-500"
                      }`}
                    >
                      {formatPKR(r.amountDue)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.status === "Completed" || r.status === "Settled"
                            ? "bg-emerald-100 text-emerald-800"
                            : r.status === "Ongoing" || r.status === "Partial"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {clickable && <ChevronRight size={16} className="inline text-slate-400" />}
                    </td>
                  </>
                );
                return clickable ? (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-emerald-50/50 cursor-pointer">
                    <Link href={href} className="contents">
                      {content}
                    </Link>
                  </tr>
                ) : (
                  <tr key={r.id} className="border-b border-slate-100">
                    {content}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
