import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "clientName", label: "Client Name", required: true },
  { key: "tripRef", label: "Trip / Booking Ref" },
  { key: "destination", label: "Destination" },
  { key: "startDate", label: "Start Date", type: "date" as const },
  { key: "endDate", label: "End Date", type: "date" as const },
  { key: "packageRevenue", label: "Package Revenue", type: "number" as const, required: true, money: true },
  { key: "hotelCost", label: "Hotels / Resorts Cost", type: "number" as const, money: true },
  { key: "transportCost", label: "Transport & Drivers", type: "number" as const, money: true },
  { key: "ticketingCost", label: "Ticketing / Airline", type: "number" as const, money: true },
  { key: "otherDirectCost", label: "Other Direct Costs", type: "number" as const, money: true },
  { key: "totalDirectCost", label: "Total Direct Cost", type: "number" as const, money: true },
  { key: "grossProfit", label: "Gross Profit", type: "number" as const, money: true },
  { key: "overheadAlloc", label: "Overhead Alloc", type: "number" as const, money: true },
  { key: "netProfit", label: "Net Profit", type: "number" as const, money: true },
  { key: "salesperson", label: "Salesperson" },
  { key: "status", label: "Status", type: "select" as const, options: ["Planned", "Ongoing", "Completed", "Cancelled"] },
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

  const rows = await prisma.trip.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Trip PnL</h1>
          <p className="text-sm text-slate-500">One row per trip — all direct costs → Gross & Net Profit auto-calculate</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Trip PnL"
        apiPath="/api/trips"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
