import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
  { key: "assetName", label: "Asset Name / Description", required: true },
  { key: "category", label: "Category", type: "select" as const, options: ["Camera", "Laptop", "Phone", "Furniture", "Other"] },
  { key: "purchaseDate", label: "Purchase Date", type: "date" as const },
  { key: "purchaseCost", label: "Purchase Cost", type: "number" as const, required: true, money: true },
  { key: "currentStatus", label: "Current Status", type: "select" as const, options: ["In Use", "In Storage", "Disposed", "Lost"] },
  { key: "location", label: "Location" },
  { key: "serialNo", label: "Serial / ID No" },
  { key: "disposalDate", label: "Disposal Date", type: "date" as const, showInTable: false },
  { key: "disposalValue", label: "Disposal Value", type: "number" as const, money: true, showInTable: false },
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

  const rows = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Company Assets</h1>
          <p className="text-sm text-slate-500">Cameras, laptops, phones, furniture — purchase, status, assignment</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Company Assets"
        apiPath="/api/assets"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
