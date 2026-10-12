import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { SalesTeamPanel } from "./SalesTeamPanel";

export default async function SalesTeamPage({
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

  const [employees, commissions, payroll, salesEntries, targetRow] =
    await Promise.all([
      prisma.employee.findMany({
        where: { isActive: true, role: "Sales" },
        orderBy: { name: "asc" },
      }),
      prisma.commission.findMany({ where: { periodId: current.id } }),
      prisma.payrollEntry.findMany({ where: { periodId: current.id } }),
      prisma.salesPerformance.findMany({
        where: { periodId: current.id },
        orderBy: { createdAt: "desc" },
      }),
      prisma.salesTarget.findUnique({ where: { periodId: current.id } }),
    ]);

  const monthlyTarget = targetRow?.targetAmount ?? 12_000_000;
  const targetNotes = targetRow?.notes ?? "";

  const TEAM_LEAD_KEYWORDS = ["ahmad", "amad", "ammar"];
  const isTeamLead = (name: string) =>
    TEAM_LEAD_KEYWORDS.some((k) => name.toLowerCase().includes(k));

  // 3-tier lead pay: <70L = 55k flat, <target = 1.5%, >=target = 2.5%
  function leadPay(teamTotal: number, target: number) {
    if (teamTotal < 7_000_000) return { amount: 55_000, rate: 0 };
    if (teamTotal < target) return { amount: teamTotal * 0.015, rate: 1.5 };
    return { amount: teamTotal * 0.025, rate: 2.5 };
  }

  // Single source of truth: SalesPerformance only
  const entriesByPerson: Record<string, number> = {};
  for (const e of salesEntries) {
    entriesByPerson[e.employeeName] =
      (entriesByPerson[e.employeeName] || 0) + (e.debit || 0);
  }

  const totalTeamSales = employees
    .filter((e) => !isTeamLead(e.name))
    .reduce((s, e) => s + (entriesByPerson[e.name] || 0), 0);

  const rows = employees.map((e) => {
    const lead = isTeamLead(e.name);
    const individual = entriesByPerson[e.name] || 0;
    const comm = commissions.find((c) => c.employeeName === e.name);
    const pay = payroll.find((p) => p.employeeName === e.name);
    const saleBase = lead ? totalTeamSales : individual;
    const leadCalc = lead ? leadPay(totalTeamSales, monthlyTarget) : null;

    // Prefer live calc for display so UI matches current entries (including zero)
    const commissionAmt = lead
      ? leadCalc!.amount
      : individual * 0.025;
    const commissionRate = lead ? leadCalc!.rate : 2.5;

    return {
      id: e.id,
      name: e.name,
      isLead: lead,
      basicSalary: pay?.basicSalary ?? (lead ? 0 : 40000),
      individualSales: individual,
      saleBase,
      commissionRate,
      commissionAmt,
      // Prefer live commission in net display baseline if payroll not synced
      netPayable:
        pay?.netPayable ??
        Math.max(0, (lead ? 0 : 40000) + commissionAmt - (pay?.loanInstallment ?? 0)),
      amountPaid: pay?.amountPaid ?? 0,
      remaining:
        pay?.remaining ??
        Math.max(
          0,
          (pay?.netPayable ?? (lead ? 0 : 40000) + commissionAmt) -
            (pay?.amountPaid ?? 0)
        ),
      status: pay?.status ?? "Pending",
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales Team Performance</h1>
          <p className="text-sm text-slate-500">
            Individual sales, 2.5% commission, and Team Lead tiered pay.
            Monthly target is editable. Sales here drive Individual Sales /
            Sale Base (including down to zero after delete).
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <SalesTeamPanel
        periodId={current.id}
        rows={rows}
        totalTeamSales={totalTeamSales}
        monthlyTarget={monthlyTarget}
        targetNotes={targetNotes}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          isLead: isTeamLead(e.name),
        }))}
        salesEntries={salesEntries.map((s) => ({
          id: s.id,
          employeeName: s.employeeName,
          tourDate: s.tourDate ? s.tourDate.toISOString() : null,
          description: s.description || "",
          clientName: s.clientName || "",
          amount: s.debit || 0,
          notes: s.notes || "",
        }))}
      />
    </div>
  );
}
