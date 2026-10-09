import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "date", label: "Date", type: "date" as const, required: true },
  { key: "type", label: "Type", type: "select" as const, options: ["Capital Introduced", "Withdrawal"], required: true },
  { key: "description", label: "Description" },
  { key: "amountIn", label: "Amount In (Capital)", type: "number" as const, money: true },
  { key: "amountOut", label: "Amount Out (Withdrawal)", type: "number" as const, money: true },
  { key: "runningBalance", label: "Running Balance", type: "number" as const, money: true },
  { key: "mode", label: "Mode" },
  { key: "recordedBy", label: "Recorded By" },
  { key: "supportingDoc", label: "Supporting Doc" },
  { key: "notes", label: "Notes", type: "textarea" as const, showInTable: false },
];

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

  const rows = await prisma.ownerTxn.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Owner / Director Account</h1>
          <p className="text-sm text-slate-500">Capital introduced & withdrawals — NEVER mix with revenue or expenses</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Owner / Director Account"
        apiPath="/api/owner"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
