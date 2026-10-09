import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";
import { ComputePayrollButton } from "@/components/ComputePayrollButton";
import { formatPKR } from "@/lib/utils";

const fields: FieldDef[] = [
  { key: "employeeName", label: "Employee Name", required: true },
  { key: "basicSalary", label: "Basic Salary", type: "number" as const, money: true },
  { key: "taxDeducted", label: "Tax Deducted", type: "number" as const, money: true },
  { key: "loanInstallment", label: "Loan Installment", type: "number" as const, money: true },
  { key: "otherDeductions", label: "Other Deductions", type: "number" as const, money: true },
  { key: "netPayable", label: "Net Payable", type: "number" as const, money: true },
  { key: "status", label: "Status", type: "select" as const, options: ["Pending", "Paid"] },
  { key: "paidDate", label: "Paid Date", type: "date" as const },
  { key: "notes", label: "Notes", type: "textarea" as const },
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

  const rows = await prisma.payrollEntry.findMany({
    where: { periodId: current.id },
    orderBy: { createdAt: "desc" },
  });
  const totalNet = rows.reduce((s, r) => s + r.netPayable, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payroll & Commissions</h1>
          <p className="text-sm text-slate-500">Sales: 40k basic + 2.5% own sales | Lead Amad Amjad: 2.5% of ALL team sales (no basic)</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <ComputePayrollButton periodId={current.id} />
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Total Net Payable: <strong>{formatPKR(totalNet)}</strong>
        </span>
      </div>

      <CrudPanel
        title="Payroll & Commissions"
        apiPath="/api/payroll"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />
    </div>
  );
}
