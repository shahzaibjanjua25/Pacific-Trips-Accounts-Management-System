import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "airline", label: "Airline" },
  { key: "clientName", label: "Client Name" },
  { key: "tripRef", label: "Trip / Booking Ref" },
  { key: "ticketCost", label: "Ticket Cost (paid)", type: "number" as const, required: true, money: true },
  { key: "chargedToClient", label: "Charged to Clients", type: "number" as const, money: true },
  { key: "profit", label: "Ticketing Profit", type: "number" as const, money: true },
  { key: "status", label: "Status", type: "select" as const, options: ["Booked", "Issued", "Cancelled"] },
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

  const rows = await prisma.ticketing.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Ticketing</h1>
          <p className="text-sm text-slate-500">Airline tickets — cost paid, charged to client, profit</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Ticketing"
        apiPath="/api/ticketing"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
