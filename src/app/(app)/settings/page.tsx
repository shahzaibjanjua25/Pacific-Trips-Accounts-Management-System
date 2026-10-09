import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";

const empFields: FieldDef[] = [
  { key: "name", label: "Name", required: true },
  { key: "role", label: "Role", type: "select", options: ["Sales", "Admin", "Driver", "Staff"] },
  { key: "basicSalary", label: "Basic Salary", type: "number", money: true },
  { key: "phone", label: "Phone" },
];

export default async function SettingsPage({
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
  const employees = await prisma.employee.findMany({ orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Settings & Employees</h1>
          <p className="text-sm text-slate-500">
            Manage staff. Sales role gets 40k + 2.5% commission. Name &quot;Amad Amjad&quot; = team lead (2.5% of all sales, no basic).
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Employees"
        apiPath="/api/employees"
        periodId={current.id}
        fields={empFields}
        rows={employees as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
