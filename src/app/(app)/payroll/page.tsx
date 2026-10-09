import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";
import { ComputePayrollButton } from "@/components/ComputePayrollButton";
import { formatPKR } from "@/lib/utils";

const fields: FieldDef[] = [
  { key: "employeeName", label: "Employee", required: true },
  { key: "basicSalary", label: "Basic Salary", type: "number", money: true },
  { key: "taxDeducted", label: "Tax Deducted", type: "number", money: true },
  { key: "loanInstallment", label: "Loan Installment", type: "number", money: true },
  { key: "otherDeductions", label: "Other Deductions", type: "number", money: true },
  { key: "netPayable", label: "Net Payable", type: "number", money: true },
  { key: "status", label: "Status", type: "select", options: ["Pending", "Paid"] },
  { key: "notes", label: "Notes", type: "textarea" },
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
  const commissions = await prisma.commission.findMany({
    where: { periodId: current.id },
  });
  const totalNet = rows.reduce((s, r) => s + r.netPayable, 0);
  const totalComm = commissions.reduce((s, c) => s + c.commissionAmt, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payroll & Commissions</h1>
          <p className="text-sm text-slate-500">
            Sales members: 40,000 basic + 2.5% of own sales · Team Lead Amad Amjad: 2.5% of ALL team sales (no basic)
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <ComputePayrollButton periodId={current.id} />
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Total Net Payable: <strong>{formatPKR(totalNet)}</strong>
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Total Commissions: <strong>{formatPKR(totalComm)}</strong>
        </span>
      </div>

      <CrudPanel
        title="Payroll Entries"
        apiPath="/api/payroll"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />

      {commissions.length > 0 && (
        <div className="bg-white rounded-xl border p-4">
          <h3 className="font-semibold mb-2">Commissions Accrued</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 uppercase">
                <th className="py-1">Employee</th>
                <th className="py-1 text-right">Sale Base</th>
                <th className="py-1 text-right">Rate</th>
                <th className="py-1 text-right">Commission</th>
                <th className="py-1">Status</th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-1.5">{c.employeeName}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatPKR(c.saleAmount)}</td>
                  <td className="py-1.5 text-right">{c.commissionRate}%</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{formatPKR(c.commissionAmt)}</td>
                  <td className="py-1.5">{c.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
