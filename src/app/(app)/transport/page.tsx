import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "driverName", label: "Driver Name" },
  { key: "vehicle", label: "Vehicle" },
  { key: "clientName", label: "Client Name" },
  { key: "tripRef", label: "Trip / Booking Ref" },
  { key: "agreedCost", label: "Agreed Cost", type: "number" as const, required: true, money: true },
  { key: "fuelCost", label: "Fuel Cost", type: "number" as const, money: true },
  { key: "finalSettlement", label: "Final Settlement", type: "number" as const, money: true },
  { key: "remaining", label: "Remaining", type: "number" as const, money: true },
  { key: "status", label: "Status", type: "select" as const, options: ["Pending", "Partial", "Settled"] },
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

  const rows = await prisma.transportJob.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transport</h1>
          <p className="text-sm text-slate-500">Transport & drivers — agreed cost, fuel, settlement, remaining</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Transport"
        apiPath="/api/transport"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
