import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "date", label: "Date", type: "date" as const },
  { key: "category", label: "Category", type: "select" as const, options: ["Rent", "Electricity", "Internet/Telephone", "Maintenance", "Saving", "Supplies", "Other"], required: true },
  { key: "description", label: "Description" },
  { key: "amount", label: "Amount (PKR)", type: "number" as const, required: true, money: true },
  { key: "vendor", label: "Vendor / Paid To" },
  { key: "paymentMethod", label: "Payment Method", type: "select" as const, options: ["Bank", "Cash", "Jazzcash", "Easypaisa", "Other"] },
  { key: "receiptRef", label: "Receipt / Doc Ref" },
  { key: "approvedBy", label: "Approved By" },
  { key: "department", label: "Department" },
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

  const rows = await prisma.officeExpense.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Office Expenses</h1>
          <p className="text-sm text-slate-500">Rent, utilities, maintenance, saving — no amount too small</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Office Expenses"
        apiPath="/api/expenses"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
