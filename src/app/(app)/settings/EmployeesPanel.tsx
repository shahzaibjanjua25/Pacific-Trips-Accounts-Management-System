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
 * Normalize a role string for grouping in the UI only.
 * The DB value is never modified by this.
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

  // KEY FIX #1: keep local state in sync with the server-provided list.
  // Without this, after router.refresh() fires, the panel could show stale
  // roles and clicking Edit could then push a wrong role back to the DB.
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
  const roleOptions = Array.from(
    new Set([...STANDARD_ROLES, ...existingRoles, form.role].filter(Boolean))
  ).sort();

  function openAdd() {
    setEditing(null);
    setForm({ ...emptyForm });
    setOpen(true);
    setError(null);
  }

  function openEdit(e: Employee) {
    setEditing(e);
    // KEY FIX #2: never default a null role to "Staff". Fall back to "Sales"
    // so editing an employee can never silently rewrite their role to Staff.
    const safeRole =
      e.role && e.role.trim() !== "" ? e.role.trim() : "Sales";
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
        editing ? "Updating employee…" : "Creating employee…",
        async () => {
          const payload = {
            name: form.name.trim(),
            role: form.role.trim(),
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

          setEmployees((prev) => {
            const next: Employee = {
              id: saved.id,
              name: saved.name,
              role: saved.role,
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
      await mutate("Deleting employee…", async () => {
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
            Sales team: {grouped.sales.length} · Other staff:{" "}
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
                  onChange={(e) =>
                    setForm({ ...form, loanOriginal: e.target.value })
                  }
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
              Leave all three at 0 for employees without a loan. The payroll
              page will deduct the installment from their salary until the
              remaining reaches 0.
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
                ? "Saving…"
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
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-4 py-2 border-b bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500">{subtitle}</p>
      </div>
      {rows.length === 0 ? (
        <div className="p-6 text-center text-sm text-slate-500">
          No {title.toLowerCase()} employees yet.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 border-b">
                {[
                  "Name",
                  "Role",
                  "Basic Salary",
                  "Phone",
                  "Loan Remaining",
                  "Status",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-slate-100 hover:bg-slate-50/70"
                >
                  <td className="px-3 py-2 font-medium">{e.name}</td>
                  <td className="px-3 py-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800">
                      {e.role || "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPKR(e.basicSalary)}
                  </td>
                  <td className="px-3 py-2">{e.phone || "—"}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      e.loanRemaining > 0
                        ? "text-red-600 font-medium"
                        : "text-slate-500"
                    }`}
                  >
                    {e.loanRemaining > 0 ? formatPKR(e.loanRemaining) : "—"}
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