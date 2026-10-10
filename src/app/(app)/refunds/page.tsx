import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { RefundsPanel } from "./RefundsPanel";

export default async function Page({
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

  const [rows, clients] = await Promise.all([
    prisma.refund.findMany({
      where: { periodId: current.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.client.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Refunds</h1>
          <p className="text-sm text-slate-500">
            Keep open until money actually paid to client
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <RefundsPanel
        periodId={current.id}
        clients={clients}
        rows={rows.map((r) => ({
          id: r.id,
          clientName: r.clientName,
          amount: r.amount,
          reason: r.reason,
          status: r.status,
          paidDate: r.paidDate ? r.paidDate.toISOString() : null,
          tripRef: r.tripRef,
          notes: r.notes,
        }))}
      />
    </div>
  );
}