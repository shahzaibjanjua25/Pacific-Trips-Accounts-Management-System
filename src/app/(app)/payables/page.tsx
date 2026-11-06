import { NoAccountingMonth } from "@/components/NoAccountingMonth";
import { prisma } from "@/lib/prisma";
import { resolveActivePeriod } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "supplierName", label: "Supplier Name", required: true },
  {
    key: "category",
    label: "Category",
    type: "select",
    options: ["Hotel", "Transport", "Other"],
  },
  { key: "description", label: "Description" },
  { key: "invoiceRef", label: "Invoice / Doc Ref" },
  {
    key: "originalAmount",
    label: "Original Amount",
    type: "number",
    required: true,
    money: true,
  },
  { key: "amountPaid", label: "Amount Paid", type: "number", money: true },
  {
    key: "remaining",
    label: "Remaining",
    type: "number",
    money: true,
    readOnly: true,
  },
  { key: "dueDate", label: "Due Date", type: "date" },
  {
    key: "daysOverdue",
    label: "Days Overdue",
    type: "number",
    readOnly: true,
  },
  { key: "relatedTrip", label: "Trip / Booking Ref" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: ["Open", "Partial", "Paid", "Overdue"],
  },
  { key: "notes", label: "Notes", type: "textarea", showInTable: false },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const { periods, current } = await resolveActivePeriod(params.period);
  if (!current) return <NoAccountingMonth />;

  const rows = await prisma.payable.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Supplier Payables</h1>
          <p className="text-sm text-slate-500">
            Financial master for money we owe. Hotels &amp; Transport pages read
            from here.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Supplier Payables"
        apiPath="/api/payables"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
        linkedEntityType="payable"
      />
    </div>
  );
}