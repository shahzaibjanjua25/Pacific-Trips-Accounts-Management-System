import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "date", label: "Date", type: "date" as const, required: true },
  { key: "description", label: "Description", required: true },
  { key: "personReceiving", label: "Person Receiving" },
  { key: "amountOut", label: "Amount Out", type: "number" as const, money: true },
  { key: "amountIn", label: "Amount In", type: "number" as const, money: true },
  { key: "purpose", label: "Purpose" },
  { key: "receiptRef", label: "Receipt / Doc" },
  { key: "balanceAfter", label: "Balance After", type: "number" as const, money: true },
  { key: "approvedBy", label: "Approved By" },
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

  const rows = await prisma.pettyCashTxn.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Petty Cash Register</h1>
          <p className="text-sm text-slate-500">Physical cash must match accounting record</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Petty Cash Register"
        apiPath="/api/petty-cash"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
