import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolveActivePeriod } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { ShieldCheck } from "lucide-react";
import { EmployeesPanel } from "./EmployeesPanel"; 

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const { periods, current } = await resolveActivePeriod(params.period);
  const employees = await prisma.employee.findMany({
    orderBy: { name: "asc" },
    include: { loans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  // Distinct roles currently in the DB, so the edit form never loses
  // an existing role even if it's not in the "standard" list.
  const existingRoles = Array.from(
    new Set(employees.map((e) => (e.role || "").trim()).filter(Boolean))
  ).sort();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Settings &amp; Employees</h1>
          <p className="text-sm text-slate-500">
            Add or edit staff, set their role, salary and phone.{" "}
            <strong>Role</strong> decides which payroll table they appear in:{" "}
            <strong>Sales</strong> / <strong>Team Lead-Sales</strong> → Sales
            payroll; everything else → Other Staff.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <Link
        href="/settings/security"
        className="inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
      >
        <ShieldCheck size={16} />
        Security settings (change password &amp; questions)
      </Link>

      <EmployeesPanel
        periodId={current.id}
        initialEmployees={employees.map((e) => ({
          id: e.id,
          name: e.name,
          role: e.role,
          basicSalary: e.basicSalary,
          phone: e.phone,
          isActive: e.isActive,
          loanOriginal: e.loans[0]?.originalAmount ?? 0,
          loanRemaining: e.loans[0]?.remainingAmount ?? 0,
          loanInstallment: e.loans[0]?.monthlyInstallment ?? 0,
        }))}
        existingRoles={existingRoles}
      />
    </div>
  );
}