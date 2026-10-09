import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const fields: FieldDef[] = [
    { key: "assetName", label: "Asset Name", required: true },
    { key: "category", label: "Category", type: "select", options: ["Camera", "Laptop", "Phone", "Furniture", "Other"] },
    { key: "purchaseDate", label: "Purchase Date", type: "date" },
    { key: "purchaseCost", label: "Purchase Cost", type: "number", required: true, money: true },
    { key: "currentStatus", label: "Status", type: "select", options: ["In Use", "In Storage", "Disposed", "Lost"] },
    { key: "location", label: "Location" },
    { key: "serialNo", label: "Serial No" },
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

  const rows = await prisma.asset.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Company Assets</h1>
          <p className="text-sm text-slate-500">Computers, phones, cameras, furniture</p>
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
