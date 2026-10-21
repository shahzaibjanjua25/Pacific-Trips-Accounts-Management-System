import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { SalesTeamPanel } from "./SalesTeamPanel";

function isSalesRole(role: string | null | undefined): boolean {
  if (!role) return false;
  const r = role.trim().toLowerCase();
  return (
    r === "sales" ||
    r === "sale" ||
    r === "team lead-sales" ||
    r === "team lead sales" ||
    r === "teamlead-sales" ||
    r === "team-lead-sales"
  );
}

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

  const [allActive, commissions, payroll, salesEntries, targetRow] =
    await Promise.all([
      prisma.employee.findMany({
        where: { isActive: true },
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

  // Include any case/spacing variant of Sales / Team Lead-Sales
  const employees = allActive.filter((e) => isSalesRole(e.role));

  const monthlyTarget = targetRow?.targetAmount ?? 12_000_000;
  const commissionBase = targetRow?.commissionBaseAmount ?? 7_000_000;
  const targetNotes = targetRow?.notes ?? "";

  const TEAM_LEAD_KEYWORDS = ["ahmad", "amad", "ammar"];
  const isTeamLead = (name: string, role: string | null) => {
    const r = (role || "").trim().toLowerCase();
    if (
      r === "team lead-sales" ||
      r === "team lead sales" ||
      r === "teamlead-sales" ||
      r === "team-lead-sales"
    ) {
      return true;
    }
    return TEAM_LEAD_KEYWORDS.some((k) => name.toLowerCase().includes(k));
  };

  function leadPay(teamTotal: number, target: number, base: number) {
    if (teamTotal < base) return { amount: 55_000, rate: 0 };
    if (teamTotal < target) return { amount: teamTotal * 0.01, rate: 1.0 };
    return { amount: teamTotal * 0.025, rate: 2.5 };
  }

  const entriesByPerson: Record<string, number> = {};
  for (const e of salesEntries) {
    const key = e.employeeName;
    entriesByPerson[key] = (entriesByPerson[key] || 0) + (e.debit || 0);
  }

  // Case-insensitive helpers for matching payroll / commission
  function findByName<T extends { employeeName: string }>(
    list: T[],
    name: string
  ): T | undefined {
    const lower = name.toLowerCase();
    return (
      list.find((x) => x.employeeName === name) ??
      list.find((x) => x.employeeName.toLowerCase() === lower)
    );
  }

  const totalTeamSales = employees
    .filter((e) => !isTeamLead(e.name, e.role))
    .reduce((s, e) => {
      const direct = entriesByPerson[e.name] || 0;
      const fuzzy = Object.entries(entriesByPerson).reduce((acc, [k, v]) => {
        if (k.toLowerCase() === e.name.toLowerCase()) return acc + v;
        return acc;
      }, 0);
      return s + (direct || fuzzy);
    }, 0);

  const rows = employees.map((e) => {
    const lead = isTeamLead(e.name, e.role);
    const fromEntries =
      entriesByPerson[e.name] ||
      Object.entries(entriesByPerson).reduce((acc, [k, v]) => {
        if (k.toLowerCase() === e.name.toLowerCase()) return acc + v;
        return acc;
      }, 0);
    const comm = findByName(commissions, e.name);
    const pay = findByName(payroll, e.name);
    const leadCalc = lead
      ? leadPay(totalTeamSales, monthlyTarget, commissionBase)
      : null;

    // Prefer values already saved on Commission / Payroll so edits stick.
    // Fall back to live sales entries / formula only when no row exists yet.
    const individual =
      !lead && comm && typeof comm.saleAmount === "number"
        ? comm.saleAmount
        : fromEntries;
    const saleBase = lead
      ? (comm && typeof comm.saleAmount === "number"
          ? comm.saleAmount
          : totalTeamSales)
      : individual;

    const commissionAmt =
      comm && typeof comm.commissionAmt === "number"
        ? comm.commissionAmt
        : lead
          ? leadCalc!.amount
          : individual * 0.025;
    const commissionRate =
      comm && typeof comm.commissionRate === "number"
        ? comm.commissionRate
        : lead
          ? leadCalc!.rate
          : 2.5;

    const basicDefault = lead ? 0 : e.basicSalary || 40000;
    const basic = pay?.basicSalary ?? basicDefault;
    const netDefault = Math.max(
      0,
      basic + commissionAmt - (pay?.loanInstallment ?? 0)
    );

    return {
      id: e.id,
      name: e.name,
      isLead: lead,
      basicSalary: basic,
      individualSales: individual,
      saleBase,
      commissionRate,
      commissionAmt,
      netPayable: pay?.netPayable ?? netDefault,
      amountPaid: pay?.amountPaid ?? 0,
      remaining:
        pay?.remaining ??
        Math.max(0, (pay?.netPayable ?? netDefault) - (pay?.amountPaid ?? 0)),
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
            Monthly target and commission base are editable per month. Delete
            removes this month&apos;s commission/payroll and moves the person
            out of the Sales roster (role → Staff).
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <SalesTeamPanel
        periodId={current.id}
        rows={rows}
        totalTeamSales={totalTeamSales}
        monthlyTarget={monthlyTarget}
        commissionBase={commissionBase}
        targetNotes={targetNotes}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          isLead: isTeamLead(e.name, e.role),
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
