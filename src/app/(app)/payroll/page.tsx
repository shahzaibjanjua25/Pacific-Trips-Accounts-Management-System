import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";
import { ComputePayrollButton } from "@/components/ComputePayrollButton";
import { InitPayrollButton } from "@/components/InitPayrollButton";
import { SyncAllPayrollButton } from "@/components/SyncAllPayrollButton";
import { formatPKR } from "@/lib/utils";

/**
 * Normalize a role string.
 * Returns the canonical role, treating any case variant of "sales" or
 * "team lead-sales" as the correct bucket.
 */
function normalizeRole(role: string | null | undefined): string {
  if (!role) return "Staff";
  const r = role.trim();
  const lower = r.toLowerCase();
  if (lower === "sales" || lower === "sale") return "Sales";
  if (
    lower === "team lead-sales" ||
    lower === "team lead sales" ||
    lower === "teamlead-sales" ||
    lower === "team-lead-sales"
  ) {
    return "Team Lead-Sales";
  }
  return r;
}

function isSalesRole(role: string | null | undefined): boolean {
  const n = normalizeRole(role);
  return n === "Sales" || n === "Team Lead-Sales";
}

/**
 * Display label for Team column.
 * Prefer live Employee.role (source of truth) over any hardcoded map.
 */
function teamLabel(name: string, role?: string | null): string {
  if (role && role.trim()) {
    const norm = normalizeRole(role);
    if (norm === "Sales" || norm === "Team Lead-Sales") return norm;
    return role.trim();
  }
  return "Staff";
}

const TEAM_OPTIONS_SALES_FIRST = [
  "Sales",
  "Team Lead-Sales",
  "Graphic Designer",
  "Meta Marketing",
  "CEO",
  "Accountant",
  "Legal Team",
  "Office Boy",
  "Staff",
];

const TEAM_OPTIONS_STAFF_FIRST = [
  "Staff",
  "Graphic Designer",
  "Meta Marketing",
  "CEO",
  "Accountant",
  "Legal Team",
  "Office Boy",
  "Sales",
  "Team Lead-Sales",
];

function makeFields(teamOptions: string[]): FieldDef[] {
  return [
    { key: "employeeName", label: "Employee Name", required: true },
    {
      key: "team",
      label: "Team / Designation",
      type: "select" as const,
      options: teamOptions,
    },
    { key: "bonus", label: "Bonus", type: "number" as const, money: true },
    {
      key: "basicSalary",
      label: "Basic Salary",
      type: "number" as const,
      money: true,
    },
    {
      key: "commissionAmt",
      label: "Commission (2.5%)",
      type: "number" as const,
      money: true,
      // readOnly: true,
    },
    {
      key: "taxDeducted",
      label: "Tax Deducted",
      type: "number" as const,
      money: true,
    },
    {
      key: "loanInstallment",
      label: "Loan Installment (This Month)",
      type: "number" as const,
      money: true,
    },
    {
      key: "loanOriginal",
      label: "Loan Original",
      type: "number" as const,
      money: true,
      // readOnly: true,
    },
    {
      key: "loanBalance",
      label: "Loan Balance (Total Owed)",
      type: "number" as const,
      money: true,
    },
    {
      key: "otherDeductions",
      label: "Other Deductions",
      type: "number" as const,
      money: true,
    },
    {
      key: "netPayable",
      label: "Net Payable",
      type: "number" as const,
      money: true,
    },
    {
      key: "amountPaid",
      label: "Amount Paid",
      type: "number" as const,
      money: true,
    },
    {
      key: "remaining",
      label: "Remaining",
      type: "number" as const,
      money: true,
      // readOnly: true,
    },
    {
      key: "status",
      label: "Status",
      type: "select" as const,
      options: ["Pending", "Partial", "Paid"],
    },
    { key: "paidDate", label: "Paid Date", type: "date" as const },
    { key: "notes", label: "Notes", type: "textarea" as const },
  ];
}

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

  const [rows, commissions, allEmployees] = await Promise.all([
    prisma.payrollEntry.findMany({
      where: { periodId: current.id },
      orderBy: { employeeName: "asc" },
    }),
    prisma.commission.findMany({ where: { periodId: current.id } }),
    prisma.employee.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      include: { loans: true },
    }),
  ]);

  // Case-insensitive name â†’ role map (source of truth for bucketing)
  const roleByName: Record<string, string> = {};
  const roleByNameLower: Record<string, string> = {};
  for (const e of allEmployees) {
    const norm = normalizeRole(e.role);
    roleByName[e.name] = norm;
    roleByNameLower[e.name.toLowerCase()] = norm;
  }

  const loanByEmp: Record<
    string,
    { originalAmount: number; remainingAmount: number }
  > = {};
  for (const e of allEmployees) {
    const loan = e.loans?.[0];
    if (loan) {
      loanByEmp[e.name] = {
        originalAmount: loan.originalAmount,
        remainingAmount: loan.remainingAmount,
      };
      loanByEmp[e.name.toLowerCase()] = loanByEmp[e.name];
    }
  }

  const commissionByEmp: Record<string, number> = {};
  for (const c of commissions) {
    const empRole =
      roleByName[c.employeeName] ??
      roleByNameLower[c.employeeName.toLowerCase()];
    if (isSalesRole(empRole)) {
      commissionByEmp[c.employeeName] =
        (commissionByEmp[c.employeeName] || 0) + c.commissionAmt;
    }
  }

  function lookupRole(employeeName: string): string {
    return (
      roleByName[employeeName] ??
      roleByNameLower[employeeName.toLowerCase()] ??
      "Staff"
    );
  }

  function lookupLoan(employeeName: string) {
    return (
      loanByEmp[employeeName] ?? loanByEmp[employeeName.toLowerCase()] ?? null
    );
  }

  const enriched = rows.map((r) => {
    const role = lookupRole(r.employeeName);
    const loan = lookupLoan(r.employeeName);
    return {
      ...r,
      team: teamLabel(r.employeeName, role),
      commissionAmt: commissionByEmp[r.employeeName] ?? 0,
      loanOriginal: loan?.originalAmount ?? 0,
      loanBalance: loan?.remainingAmount ?? 0,
    };
  });

  // Partition by Employee.role (via enriched.team)
  const salesPayroll = enriched.filter((r) => isSalesRole(r.team));
  const otherPayroll = enriched.filter((r) => !isSalesRole(r.team));

  const totalSalesNet = salesPayroll.reduce((s, r) => s + r.netPayable, 0);
  const totalOtherNet = otherPayroll.reduce((s, r) => s + r.netPayable, 0);
  const totalComm = commissions.reduce((s, c) => s + c.commissionAmt, 0);

  const totalOutstandingSalary = enriched.reduce(
    (s, r) => s + Math.max(0, r.netPayable - (r.amountPaid ?? 0)),
    0
  );

  const salesRoster = allEmployees.filter((e) => isSalesRole(e.role));

  const salesFields = makeFields(TEAM_OPTIONS_SALES_FIRST);
  const otherFields = makeFields(TEAM_OPTIONS_STAFF_FIRST);

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Payroll &amp; Commissions</h1>
          <p className="text-sm text-slate-500">
            Team / Designation is saved to the employee record. Sales / Team
            Lead-Sales appear in the Sales block and get commission. Everyone
            else is Other Staff.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h2 className="font-semibold text-emerald-900 mb-2">
          Sales Team ({salesRoster.length}) â€” 2.5% commission (Team Lead
          tiered)
        </h2>
        <div className="flex flex-wrap gap-2">
          {salesRoster.map((e) => (
            <span
              key={e.id}
              className="text-xs bg-white border border-emerald-200 text-emerald-900 px-2.5 py-1 rounded-full"
            >
              {e.name}
              <span className="text-emerald-600 ml-1">
                ({normalizeRole(e.role)})
              </span>
            </span>
          ))}
          {salesRoster.length === 0 && (
            <span className="text-sm text-emerald-800">
              No Sales / Team Lead-Sales employees yet. Add one below (set Team
              = Sales) or in Settings.
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <InitPayrollButton periodId={current.id} />
        <ComputePayrollButton periodId={current.id} />
        <SyncAllPayrollButton periodId={current.id} />
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Sales Net: <strong>{formatPKR(totalSalesNet)}</strong>
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Other Net: <strong>{formatPKR(totalOtherNet)}</strong>
        </span>
        <span className="text-sm bg-slate-100 px-3 py-1.5 rounded-md">
          Commissions: <strong>{formatPKR(totalComm)}</strong>
        </span>
        <span className="text-sm bg-amber-100 text-amber-900 px-3 py-1.5 rounded-md">
          Outstanding Salary:{" "}
          <strong>{formatPKR(totalOutstandingSalary)}</strong>
        </span>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2 text-emerald-800">
          Sales Team Payroll ({salesPayroll.length})
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          When you Add / Edit here, set <strong>Team / Designation = Sales</strong>{" "}
          (or Team Lead-Sales). That updates the employee role so they stay in
          this table.
        </p>
        <CrudPanel
          title="Sales Team Payroll"
          apiPath="/api/payroll"
          periodId={current.id}
          fields={salesFields}
          rows={
            salesPayroll as unknown as (Record<string, unknown> & {
              id: string;
            })[]
          }
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2 text-slate-700">
          Other Staff â€” no commission ({otherPayroll.length})
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          To move someone into Sales, edit their row and change Team to{" "}
          <strong>Sales</strong> or <strong>Team Lead-Sales</strong>, then save.
        </p>
        <CrudPanel
          title="Other Staff Payroll"
          apiPath="/api/payroll"
          periodId={current.id}
          fields={otherFields}
          rows={
            otherPayroll as unknown as (Record<string, unknown> & {
              id: string;
            })[]
          }
        />
      </div>
    </div>
  );
}
