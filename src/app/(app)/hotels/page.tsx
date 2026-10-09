import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
    { key: "hotelName", label: "Hotel", required: true },
    { key: "clientName", label: "Client" },
    { key: "tripRef", label: "Trip Ref" },
    { key: "checkIn", label: "Check In", type: "date" },
    { key: "checkOut", label: "Check Out", type: "date" },
    { key: "nights", label: "Nights", type: "number" },
    { key: "rooms", label: "Rooms", type: "number" },
    { key: "agreedCost", label: "Agreed Cost", type: "number", required: true, money: true },
    { key: "amountPaid", label: "Amount Paid", type: "number", money: true },
    { key: "status", label: "Status", type: "select", options: ["Booked", "Partial", "Paid", "Cancelled"] },
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

  const rows = await prisma.hotelBooking.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hotels</h1>
          <p className="text-sm text-slate-500">Hotel bookings — remaining payable auto-calculates</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Hotels"
        apiPath="/api/hotels"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
