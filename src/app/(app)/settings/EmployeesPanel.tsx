"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X, Loader2 } from "lucide-react";
import { formatPKR } from "@/lib/utils";
import { useMutate } from "@/components/useMutate";

type Employee = {
  id: string;
  name: string;
  role: string | null;
  basicSalary: number;
  phone: string | null;
  isActive: boolean;
  loanOriginal: number;
  loanRemaining: number;
  loanInstallment: number;
  loanNotes?: string | null;
};

const STANDARD_ROLES = [
  "Sales",
  "Team Lead-Sales",
  "Graphic Designer",
  "Meta Marketing",
  "CEO",
  "Accountant",
  "Legal Team",
  "Office Boy",
  "Admin",
  "Driver",
  "Staff",
];

const emptyForm = {
  name: "",
  role: "Sales",
  basicSalary: "40000",
  phone: "",
  isActive: true,
  loanOriginal: "0",
  loanRemaining: "0",
  loanInstallment: "0",
};

/**
 * Canonicalize role for both grouping and what we send to the API.
 * Keeps Sales / Team Lead-Sales consistent regardless of case/spacing.
 */
function canonicalizeRole(raw: string | null | undefined): string {
  if (!raw) return "Sales";
  const t = raw.trim();
  if (!t) return "Sales";
  const lower = t.toLowerCase();
  if (lower === "sales" || lower === "sale") return "Sales";
  if (
    lower === "team lead-sales" ||
    lower === "team lead sales" ||
    lower === "teamlead-sales" ||
    lower === "team-lead-sales"
  ) {
    return "Team Lead-Sales";
  }
  return t;
}

/**
 * Normalize a role string for grouping in the UI only.
 */
function normalizedRole(role: string | null): string {
  if (!role) return "";
  const r = role.trim().toLowerCase();
  if (r === "sales" || r === "sale") return "Sales";
  if (
    r === "team lead-sales" ||
    r === "team lead sales" ||
    r === "teamlead-sales" ||
    r === "team-lead-sales"
  ) {
    return "Team Lead-Sales";
  }
  return role.trim();
}

export function EmployeesPanel({
  periodId,
  initialEmployees,
  existingRoles,
}: {
  periodId: string;
  initialEmployees: Employee[];
  existingRoles: string[];
}) {
  const router = useRouter();
  const mutate = useMutate();

  // Keep local state in sync with the server-provided list so after
  // router.refresh() the panel never shows a stale role.
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees);
  useEffect(() => {
    setEmployees(initialEmployees);
  }, [initialEmployees]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Combine standard roles + whatever is already in the DB, dedup + sort.
  // Keep Sales / Team Lead-Sales first so they are easy to pick.
  const roleOptions = (() => {
    const set = new Set(
      [...STANDARD_ROLES, ...existingRoles, form.role]
        .map((r) => (r || "").trim())
        .filter(Boolean)
    );
    const preferred = ["Sales", "Team Lead-Sales"];
    const rest = Array.from(set)
      .filter((r) => !preferred.includes(r))
      .sort((a, b) => a.localeCompare(b));
    return [...preferred.filter((r) => set.has(r)), ...rest];
  })();

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
    setError(null);
  }

  function openEdit(e: Employee) {
    setEditing(e);
    // Never default a null/empty role to "Staff" â€” use Sales so an edit
    // cannot silently rewrite a salesperson into Other Staff.
    const safeRole = canonicalizeRole(e.role);
    setForm({
      name: e.name || "",
      role: safeRole,
      basicSalary: String(e.basicSalary ?? 0),
      phone: e.phone || "",
      isActive: e.isActive,
      loanOriginal: String(e.loanOriginal ?? 0),
      loanRemaining: String(e.loanRemaining ?? 0),
      loanInstallment: String(e.loanInstallment ?? 0),
    });
    setOpen(true);
    setError(null);
  }

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      alert("Name is required");
      return;
    }
    if (!form.role.trim()) {
      alert("Role is required");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await mutate(
        editing ? "Updating employeeâ€¦" : "Creating employeeâ€¦",
        async () => {
          const role = canonicalizeRole(form.role);
          const payload = {
            name: form.name.trim(),
            role,
            basicSalary: parseFloat(form.basicSalary) || 0,
            phone: form.phone.trim() || null,
            isActive: form.isActive,
            loanOriginal: parseFloat(form.loanOriginal) || 0,
            loanRemaining: parseFloat(form.loanRemaining) || 0,
            loanInstallment: parseFloat(form.loanInstallment) || 0,
          };

          const res = await fetch("/api/employees", {
            method: editing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              editing ? { ...payload, id: editing.id } : payload
            ),
          });

          if (!res.ok) {
            const text = await res.text();
            let msg = text;
            try {
              const parsed = JSON.parse(text);
              if (parsed?.error) msg = parsed.error;
            } catch {
              /* keep raw text */
            }
            throw new Error(msg);
          }

          const saved = await res.json();

          // Guard: if the server stored a different role, surface it immediately
          // instead of silently putting the employee in the wrong table.
          const stored = (saved.role ?? "").toString().trim();
          if (stored !== role) {
            throw new Error(
              `Server stored role "${saved.role}" instead of "${role}". ` +
                `Redeploy src/app/api/employees/route.ts and hard-refresh.`
            );
          }

          setEmployees((prev) => {
            const next: Employee = {
              id: saved.id,
              name: saved.name,
              // Prefer the role we sent so the UI bucket updates even if
              // a stale response field is null.
              role,
              basicSalary: saved.basicSalary,
              phone: saved.phone,
              isActive: saved.isActive ?? true,
              loanOriginal: payload.loanOriginal,
              loanRemaining: payload.loanRemaining,
              loanInstallment: payload.loanInstallment,
            };
            if (editing) {
              return prev.map((x) => (x.id === editing.id ? next : x));
            }
            return [...prev, next].sort((a, b) =>
              a.name.localeCompare(b.name)
            );
          });
        }
      );
      closeForm();
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function remove(emp: Employee) {
    if (
      !confirm(
        `Delete ${emp.name}?\n\nThis also removes their payroll / commission rows for every period they exist in. Loan records are deleted too.`
      )
    )
      return;

    setLoading(true);
    setError(null);
    try {
      await mutate("Deleting employeeâ€¦", async () => {
        const res = await fetch(`/api/employees?id=${emp.id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await res.text());
        setEmployees((prev) => prev.filter((x) => x.id !== emp.id));
      });
      router.refresh();
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const grouped = (() => {
    const sales = employees.filter((e) => {
      const n = normalizedRole(e.role);
      return n === "Sales" || n === "Team Lead-Sales";
    });
    const other = employees.filter((e) => {
      const n = normalizedRole(e.role);
      return n !== "Sales" && n !== "Team Lead-Sales";
    });
    return { sales, other };
  })();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Employees ({employees.length})
          </h2>
          <p className="text-xs text-slate-500">
            Sales team: {grouped.sales.length} Â· Other staff:{" "}
            {grouped.other.length}
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={loading}
          className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {editing ? `Edit ${editing.name}` : "New Employee"}
            </h3>
            <button type="button" onClick={closeForm}>
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Full Name *</span>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </label>

            <label className="block text-xs">
              <span className="text-slate-600 font-medium">
                Role / Designation *
              </span>
              <select
                required
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {r}
                    {r === "Sales" || r === "Team Lead-Sales"
                      ? "  (Sales payroll)"
                      : "  (Other staff)"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="text-slate-600 font-medium">
                Basic Salary (PKR)
              </span>
              <input
                type="number"
                value={form.basicSalary}
                onChange={(e) =>
                  setForm({ ...form, basicSalary: e.target.value })
                }
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Phone</span>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>

            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Status</span>
              <select
                value={form.isActive ? "Active" : "Inactive"}
                onChange={(e) =>
                  setForm({ ...form, isActive: e.target.value === "Active" })
                }
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </label>
          </div>

          <fieldset className="border-t border-amber-300 pt-3">
            <legend className="text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Employee Loan (optional)
            </legend>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-2">
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">
                  Loan Original
                </span>
                <input
                  type="number"
                  value={form.loanOriginal}
                  onChange={(e) => {
                    const v = e.target.value;
                    // On create, keep remaining in sync with original until user overrides
                    setForm((prev) => ({
                      ...prev,
                      loanOriginal: v,
                      loanRemaining: editing ? prev.loanRemaining : v,
                    }));
                  }}
                  className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">
                  Loan Remaining
                </span>
                <input
                  type="number"
                  value={form.loanRemaining}
                  onChange={(e) =>
                    setForm({ ...form, loanRemaining: e.target.value })
                  }
                  className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">
                  Monthly Installment
                </span>
                <input
                  type="number"
                  value={form.loanInstallment}
                  onChange={(e) =>
                    setForm({ ...form, loanInstallment: e.target.value })
                  }
                  className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Leave Original / Remaining / Installment at 0 if there is no loan.
              Changing Remaining records a dated line in the loan notes so you
              can see when balance was adjusted. Salary installment payments and
              Employee Loan transactions also reduce the balance with a full audit trail.
            </p>
          </fieldset>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading
                ? "Savingâ€¦"
                : editing
                  ? "Save Changes"
                  : "Create Employee"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-5 py-2 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <EmployeeTable
        title="Sales Team"
        subtitle="Appears in Sales Team Payroll. Commission auto-calculates."
        rows={grouped.sales}
        loading={loading}
        onEdit={openEdit}
        onRemove={remove}
        periodId={periodId}
      />

      <EmployeeTable
        title="Other Staff"
        subtitle="Appears in Other Staff Payroll. No commission."
        rows={grouped.other}
        loading={loading}
        onEdit={openEdit}
        onRemove={remove}
        periodId={periodId}
      />
    </div>
  );
}

function EmployeeTable({
  title,
  subtitle,
  rows,
  loading,
  onEdit,
  onRemove,
  periodId,
}: {
  title: string;
  subtitle: string;
  rows: Employee[];
  loading: boolean;
  onEdit: (e: Employee) => void;
  onRemove: (e: Employee) => void;
  periodId: string;
}) {
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b bg-slate-50">
        <h3 className="font-semibold text-slate-800">
          {title} ({rows.length})
        </h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-sm text-slate-500 text-center">
          No employees in this group.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Role</th>
                <th className="px-3 py-2 font-medium text-right">Basic</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium text-right">Loan Left</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className="border-b last:border-0 hover:bg-slate-50/70"
                >
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                      {e.role || "â€”"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPKR(e.basicSalary)}
                  </td>
                  <td className="px-3 py-2">{e.phone || "â€”"}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      e.loanRemaining > 0
                        ? "text-red-600 font-medium"
                        : "text-slate-500"
                    }`}
                  >
                    {e.loanRemaining > 0 ? formatPKR(e.loanRemaining) : "—"}
                    {e.loanNotes ? (
                      <div
                        className="mt-1 text-[10px] text-slate-400 whitespace-pre-line max-w-[14rem]"
                        title={e.loanNotes}
                      >
                        {e.loanNotes.split(/\n/).slice(-3).join("\n")}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        e.isActive
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {e.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => onEdit(e)}
                      disabled={loading}
                      className="p-1.5 text-sky-600 hover:bg-sky-50 rounded disabled:opacity-40"
                      title="Edit"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemove(e)}
                      disabled={loading}
                      className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1 disabled:opacity-40"
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* keep periodId referenced for linters */}
      <span className="sr-only" aria-hidden="true">
        {periodId}
      </span>
    </div>
  );
}
