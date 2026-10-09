import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "clientName", label: "Client Name", required: true },
  { key: "contact", label: "Contact/Ref" },
  { key: "bookingDate", label: "Booking Date", type: "date" },
  { key: "tripDates", label: "Trip Dates" },
  { key: "destination", label: "Destination" },
  { key: "totalPackage", label: "Total Package", type: "number", required: true, money: true },
  { key: "amountToReceive", label: "Amount to Receive", type: "number", money: true },
  { key: "amountReceived", label: "Amount Received", type: "number", money: true },
  { key: "remainingAmount", label: "Remaining", type: "number", money: true },
  { key: "dueDate", label: "Due Date", type: "date" },
  { key: "daysOverdue", label: "Days Overdue", type: "number" },
  { key: "tripStart", label: "Trip Start", type: "date" },
  { key: "salesperson", label: "Salesperson" },
  { key: "discounts", label: "Discounts", type: "number", money: true },
  { key: "additionalCharges", label: "Additional Charges", type: "number", money: true },
  { key: "finalSettlement", label: "Final Settlement", type: "number", money: true },
  { key: "status", label: "Status", type: "select", options: ["Open", "Partial", "Settled", "Overdue"] },
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

  const rows = await prisma.receivable.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Client Receivables</h1>
          <p className="text-sm text-slate-500">
            Track every client: Total Sale → Received → Outstanding → Settlement
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Client Receivables"
        apiPath="/api/receivables"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
        linkedEntityType="receivable"
      />
    </div>
  );
}