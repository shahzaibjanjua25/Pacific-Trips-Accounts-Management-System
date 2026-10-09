import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "driverName", label: "Driver Name" },
  { key: "vehicle", label: "Vehicle" },
  { key: "clientName", label: "Client Name" },
  { key: "tripRef", label: "Trip / Booking Ref" },
  { key: "agreedCost", label: "Agreed Cost", type: "number", money: true },
  { key: "fuelCost", label: "Fuel Cost (our cost)", type: "number", money: true },
  { key: "finalSettlement", label: "Amount Paid", type: "number", money: true },
  { key: "remaining", label: "Remaining", type: "number", money: true, showInTable: false },
  { key: "status", label: "Status", type: "select", options: ["Pending", "Partial", "Settled", "Cancelled"] },
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

  const raw = await prisma.transportJob.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
    include: { payable: true },
  });

  const rows = raw.map((t) => ({
    id: t.id,
    driverName: t.driverName,
    vehicle: t.vehicle,
    clientName: t.clientName,
    tripRef: t.tripRef,
    agreedCost: t.payable?.originalAmount ?? 0,
    fuelCost: t.fuelCost,
    finalSettlement: t.payable?.amountPaid ?? 0,
    remaining: t.payable?.remaining ?? 0,
    status: t.status,
    notes: t.notes,
    payableId: t.payable?.id ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Transport</h1>
          <p className="text-sm text-slate-500">
            Operational view — money owed tracked on linked Payable.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Transport Jobs"
        apiPath="/api/transport"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
        linkedEntityType="transport"
      />
    </div>
  );
}