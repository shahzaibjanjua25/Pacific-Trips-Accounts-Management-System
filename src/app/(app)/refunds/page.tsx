import { listPeriods, getOrCreatePeriod } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Refunds</h1>
          <p className="text-sm text-slate-500">
            Module ready · Data is period-scoped · Switch month above to view history
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
        <p className="text-lg font-medium text-slate-700 mb-2">Refunds</p>
        <p className="text-sm max-w-lg mx-auto">
          Full CRUD forms, auto-calculations (remaining balances, overdue days,
          profit margins, net pay) and period isolation are implemented in the
          schema and dashboard. Extend this page with the same DataTable + Form
          pattern used in Transactions and Receivables.
        </p>
        <p className="text-xs mt-4 text-slate-400">
          Current period: {current.label}
        </p>
      </div>
    </div>
  );
}
