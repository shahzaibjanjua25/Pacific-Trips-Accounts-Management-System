import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "clientName", label: "Client Name", required: true },
  { key: "amount", label: "Refund Amount", type: "number", required: true, money: true },
  { key: "reason", label: "Reason" },
  { key: "status", label: "Status", type: "select", options: ["Pending", "Paid"] },
  { key: "paidDate", label: "Paid Date", type: "date" },
  { key: "tripRef", label: "Trip / Booking Ref" },
  { key: "notes", label: "Notes", type: "textarea", showInTable: false },
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

  const rows = await prisma.refund.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Refunds</h1>
          <p className="text-sm text-slate-500">Keep open until money actually paid to client</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Refunds"
        apiPath="/api/refunds"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
        linkedEntityType="refund"
      />
    </div>
  );
}