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

  const [employees, trips, receivables, commissions, payroll, salesEntries] =
    await Promise.all([
      prisma.employee.findMany({
        where: { isActive: true, role: "Sales" },
        orderBy: { name: "asc" },
      }),
      prisma.trip.findMany({ where: { periodId: current.id } }),
      prisma.receivable.findMany({ where: { periodId: current.id } }),
      prisma.commission.findMany({ where: { periodId: current.id } }),
      prisma.payrollEntry.findMany({ where: { periodId: current.id } }),
      prisma.salesPerformance.findMany({
        where: { periodId: current.id },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const TEAM_LEAD_KEYWORDS = ["amad", "ammar"];
  const isTeamLead = (name: string) =>
    TEAM_LEAD_KEYWORDS.some((k) => name.toLowerCase().includes(k));

  const salesByPerson: Record<string, number> = {};
  for (const t of trips) {
    const sp = t.salesperson || "Unassigned";
    salesByPerson[sp] = (salesByPerson[sp] || 0) + t.packageRevenue;
  }
  for (const r of receivables) {
    if (r.salesperson) {
      salesByPerson[r.salesperson] =
        (salesByPerson[r.salesperson] || 0) + r.totalPackage;
    }
  }

  // Also add explicit sales entries (from the sales-team page)
  const entriesByPerson: Record<string, number> = {};
  for (const e of salesEntries) {
    entriesByPerson[e.employeeName] =
      (entriesByPerson[e.employeeName] || 0) + (e.debit || 0);
  }

  const totalTeamSales = employees
    .filter((e) => !isTeamLead(e.name))
    .reduce(
      (s, e) => s + (salesByPerson[e.name] || 0) + (entriesByPerson[e.name] || 0),
      0
    );

  const rows = employees.map((e) => {
    const lead = isTeamLead(e.name);
    const individual =
      (salesByPerson[e.name] || 0) + (entriesByPerson[e.name] || 0);
    const comm = commissions.find((c) => c.employeeName === e.name);
    const pay = payroll.find((p) => p.employeeName === e.name);
    const saleBase = lead ? totalTeamSales : individual;
    const commissionAmt = comm?.commissionAmt ?? saleBase * 0.025;

    return {
      id: e.id,
      name: e.name,
      isLead: lead,
      basicSalary: pay?.basicSalary ?? (lead ? 0 : 40000),
      individualSales: individual,
      saleBase,
      commissionRate: 2.5,
      commissionAmt,
      netPayable: pay?.netPayable ?? 0,
      amountPaid: pay?.amountPaid ?? 0,
      remaining:
        pay?.remaining ?? Math.max(0, (pay?.netPayable ?? 0) - (pay?.amountPaid ?? 0)),
      status: pay?.status ?? "Pending",
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales Team Performance</h1>
          <p className="text-sm text-slate-500">
            Individual sales, 2.5% commission, and payout status. Sales entered here sync to payroll.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <SalesTeamPanel
        periodId={current.id}
        rows={rows}
        totalTeamSales={totalTeamSales}
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