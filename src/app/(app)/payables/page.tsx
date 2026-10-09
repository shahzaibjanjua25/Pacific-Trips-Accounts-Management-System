import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
    { key: "supplierName", label: "Supplier", required: true },
    { key: "category", label: "Category", type: "select", options: ["Hotel", "Transport", "Ticketing", "Other"] },
    { key: "description", label: "Description" },
    { key: "invoiceRef", label: "Invoice Ref" },
    { key: "originalAmount", label: "Original Amount", type: "number", required: true, money: true },
    { key: "amountPaid", label: "Amount Paid", type: "number", money: true },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "relatedTrip", label: "Trip Ref" },
    { key: "status", label: "Status", type: "select", options: ["Open", "Partial", "Paid"] },
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

  const rows = await prisma.payable.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Supplier Payables</h1>
          <p className="text-sm text-slate-500">Money we owe suppliers</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Supplier Payables"
        apiPath="/api/payables"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
