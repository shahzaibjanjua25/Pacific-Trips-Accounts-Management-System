import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "hotelName", label: "Hotel Name", required: true },
  { key: "clientName", label: "Client Name" },
  { key: "tripRef", label: "Trip / Booking Ref" },
  { key: "checkIn", label: "Check In", type: "date" as const },
  { key: "checkOut", label: "Check Out", type: "date" as const },
  { key: "nights", label: "Nights", type: "number" as const },
  { key: "rooms", label: "Rooms", type: "number" as const },
  { key: "agreedCost", label: "Agreed / Booking Cost", type: "number" as const, required: true, money: true },
  { key: "amountPaid", label: "Amount Paid", type: "number" as const, money: true },
  { key: "remaining", label: "Remaining Payable", type: "number" as const, money: true },
  { key: "status", label: "Status", type: "select" as const, options: ["Booked", "Partial", "Paid", "Cancelled"] },
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

  const rows = await prisma.hotelBooking.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hotels</h1>
          <p className="text-sm text-slate-500">Hotel bookings ledger — remaining payable auto-calculates</p>
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
