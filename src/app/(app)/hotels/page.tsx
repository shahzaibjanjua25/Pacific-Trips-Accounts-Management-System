import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "hotelName", label: "Hotel Name", required: true },
  { key: "clientName", label: "Client Name" },
  { key: "tripRef", label: "Trip / Booking Ref" },
  { key: "checkIn", label: "Check In", type: "date" },
  { key: "checkOut", label: "Check Out", type: "date" },
  { key: "nights", label: "Nights", type: "number" },
  { key: "rooms", label: "Rooms", type: "number" },
  { key: "agreedCost", label: "Agreed / Booking Cost", type: "number", money: true },
  { key: "amountPaid", label: "Amount Paid", type: "number", money: true },
  { key: "remaining", label: "Remaining Payable", type: "number", money: true, showInTable: false },
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

  const raw = await prisma.hotelBooking.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
    include: { payable: true },
  });

  const rows = raw.map((h) => ({
    id: h.id,
    hotelName: h.hotelName,
    clientName: h.clientName,
    tripRef: h.tripRef,
    checkIn: h.checkIn,
    checkOut: h.checkOut,
    nights: h.nights,
    rooms: h.rooms,
    agreedCost: h.payable?.originalAmount ?? 0,
    amountPaid: h.payable?.amountPaid ?? 0,
    remaining: h.payable?.remaining ?? 0,
    status: h.status,
    notes: h.notes,
    payableId: h.payable?.id ?? null,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Hotels</h1>
          <p className="text-sm text-slate-500">
            Operational view — money owed is tracked on the linked Payable. Click a row to see payments.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Hotel Bookings"
        apiPath="/api/hotels"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
        linkedEntityType="hotel"
      />
    </div>
  );
}