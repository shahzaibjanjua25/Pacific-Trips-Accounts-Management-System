
"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, X, Trash2, Search, Pencil, Loader2 } from "lucide-react";
import { formatPKR } from "@/lib/utils";
import { useMutate } from "@/components/useMutate";

type Row = {
  id: string;
  name: string;
  isLead: boolean;
  basicSalary: number;
  individualSales: number;
  saleBase: number;
  commissionRate: number;
  commissionAmt: number;
  netPayable: number;
  amountPaid: number;
  remaining: number;
  status: string;
};

type Employee = { id: string; name: string; isLead: boolean };

type SaleEntry = {
  id: string;
  employeeName: string;
  tourDate: string | null;
  description: string;
  clientName: string;
  amount: number;
  notes: string;
};

const emptySaleForm = {
  employeeName: "",
  tourDate: new Date().toISOString().slice(0, 10),
  description: "",
  clientName: "",
  amount: "",
  notes: "",
};

const emptyRowForm = {
  role: "Sales" as "Sales" | "Team Lead-Sales",
  basicSalary: "",
  individualSales: "",
  saleBase: "",
  commissionRate: "",
  commissionAmt: "",
  netPayable: "",
  amountPaid: "",
  status: "Pending" as "Pending" | "Partial" | "Paid",
  remaining: "",
  notes: "",
};

async function readError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed?.error) return String(parsed.error);
  } catch {
    /* not JSON */
  }
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

export function SalesTeamPanel({
  periodId,
  rows,
  totalTeamSales,
  monthlyTarget,
  commissionBase,
  targetNotes,
  employees,
  salesEntries,
}: {
  periodId: string;
  rows: Row[];
  totalTeamSales: number;
  monthlyTarget: number;
  commissionBase: number;
  targetNotes: string;
  employees: Employee[];
  salesEntries: SaleEntry[];
}) {
  const router = useRouter();
  const mutate = useMutate();
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"team" | "target">("team");

  const [open, setOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<SaleEntry | null>(null);
  const [form, setForm] = useState(emptySaleForm);

  const [editingRow, setEditingRow] = useState<Row | null>(null);
  const [rowForm, setRowForm] = useState(emptyRowForm);

  const [targetForm, setTargetForm] = useState({
    targetAmount: String(monthlyTarget),
    commissionBaseAmount: String(commissionBase),
    notes: targetNotes || "",
  });
  const [savingTarget, setSavingTarget] = useState(false);

  const [filterEmployee, setFilterEmployee] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchText, setSearchText] = useState("");

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (filterEmployee && r.name !== filterEmployee) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (searchText) {
        const t = searchText.toLowerCase();
        if (!r.name.toLowerCase().includes(t)) return false;
      }
      return true;
    });
  }, [rows, filterEmployee, filterStatus, searchText]);

  const filteredEntries = useMemo(() => {
    return salesEntries.filter((s) => {
      if (filterEmployee && s.employeeName !== filterEmployee) return false;
      if (searchText) {
        const t = searchText.toLowerCase();
        if (
          !s.employeeName.toLowerCase().includes(t) &&
          !s.clientName.toLowerCase().includes(t) &&
          !s.description.toLowerCase().includes(t)
        )
          return false;
      }
      return true;
    });
  }, [salesEntries, filterEmployee, searchText]);

  const totalCommission = filteredRows.reduce((s, r) => s + r.commissionAmt, 0);
  const totalNet = filteredRows.reduce((s, r) => s + r.netPayable, 0);
  const totalPaid = filteredRows.reduce((s, r) => s + r.amountPaid, 0);
  const totalRemaining = filteredRows.reduce((s, r) => s + r.remaining, 0);

  const progressPct =
    monthlyTarget > 0 ? (totalTeamSales / monthlyTarget) * 100 : 0;

  function openAdd() {
    setEditingEntry(null);
    setForm({
      ...emptySaleForm,
      employeeName: employees[0]?.name || "",
      tourDate: new Date().toISOString().slice(0, 10),
    });
    setOpen(true);
  }

  function openEditEntry(s: SaleEntry) {
    setEditingEntry(s);
    setForm({
      employeeName: s.employeeName,
      tourDate: s.tourDate
        ? s.tourDate.slice(0, 10)
        : new Date().toISOString().slice(0, 10),
      description: s.description || "",
      clientName: s.clientName || "",
      amount: String(s.amount || 0),
      notes: s.notes || "",
    });
    setOpen(true);
  }

  async function saveEntry(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const amount = parseFloat(form.amount) || 0;
      const payload = {
        periodId,
        employeeName: form.employeeName,
        tourDate: form.tourDate,
        description: form.description,
        clientName: form.clientName,
        amount,
        notes: form.notes,
      };
      await mutate(
        editingEntry ? "Updating sale…" : "Saving sale…",
        async () => {
          const res = await fetch("/api/sales-team/entry", {
            method: editingEntry ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              editingEntry ? { ...payload, id: editingEntry.id } : payload
            ),
          });
          if (!res.ok) throw new Error(await readError(res));
        }
      );
      setOpen(false);
      setEditingEntry(null);
    } catch (err) {
      alert("Save failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function removeEntry(id: string) {
    if (!confirm("Delete this sale entry?")) return;
    setLoading(true);
    try {
      await mutate("Deleting sale…", async () => {
        const res = await fetch(`/api/sales-team/entry?id=${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(await readError(res));
      });
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  function openEditRow(r: Row) {
    setEditingRow(r);
    setRowForm({
      role: r.isLead ? "Team Lead-Sales" : "Sales",
      basicSalary: String(r.basicSalary || 0),
      individualSales: String(r.individualSales || 0),
      saleBase: String(r.saleBase || 0),
      commissionRate: String(r.commissionRate || 0),
      commissionAmt: String(r.commissionAmt || 0),
      netPayable: String(r.netPayable || 0),
      amountPaid: String(r.amountPaid || 0),
      remaining: String(r.remaining || 0),
      status: (r.status as "Pending" | "Partial" | "Paid") || "Pending",
      notes: "",
    });
  }

  async function saveRow(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRow) return;
    setLoading(true);
    try {
      await mutate("Updating sales row…", async () => {
        const res = await fetch("/api/sales-team/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId,
            employeeName: editingRow.name,
            role: rowForm.role,
            basicSalary: parseFloat(rowForm.basicSalary) || 0,
            individualSales: parseFloat(rowForm.individualSales) || 0,
            saleBase: parseFloat(rowForm.saleBase) || 0,
            commissionRate: parseFloat(rowForm.commissionRate) || 0,
            commissionAmt: parseFloat(rowForm.commissionAmt) || 0,
            netPayable:
              rowForm.netPayable === ""
                ? undefined
                : parseFloat(rowForm.netPayable) || 0,
            remaining: parseFloat(rowForm.remaining) || 0,
            amountPaid: parseFloat(rowForm.amountPaid) || 0,
            status: rowForm.status,
            notes: rowForm.notes,
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
      });
      setEditingRow(null);
    } catch (err) {
      alert("Save failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function removeRow(r: Row) {
    if (
      !confirm(
        `Remove ${r.name} from Sales Team for this month?\n\n` +
          `This deletes their commission + payroll row and sets their role to Staff ` +
          `(they leave the Sales Team page).\n\nThis cannot be undone.`
      )
    )
      return;
    setLoading(true);
    try {
      await mutate("Deleting sales row…", async () => {
        const res = await fetch(
          `/api/sales-team/update?periodId=${periodId}&employeeName=${encodeURIComponent(
            r.name
          )}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(await readError(res));
      });
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function saveTarget(e: React.FormEvent) {
    e.preventDefault();
    setSavingTarget(true);
    try {
      await mutate("Saving target…", async () => {
        const res = await fetch("/api/sales-target", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodId,
            targetAmount: parseFloat(targetForm.targetAmount) || 0,
            commissionBaseAmount: parseFloat(targetForm.commissionBaseAmount) || 0,
            notes: targetForm.notes,
          }),
        });
        if (!res.ok) throw new Error(await readError(res));
      });
    } catch (err) {
      alert("Save failed: " + err);
    } finally {
      setSavingTarget(false);
    }
  }

  const previewNet = (() => {
    const basic = parseFloat(rowForm.basicSalary) || 0;
    const comm = parseFloat(rowForm.commissionAmt) || 0;
    return Math.max(0, basic + comm);
  })();
  const previewRemaining = (() => {
    const net =
      rowForm.netPayable === ""
        ? previewNet
        : parseFloat(rowForm.netPayable) || 0;
    const paid = parseFloat(rowForm.amountPaid) || 0;
    return Math.max(0, net - paid);
  })();

  return (
    <div className="space-y-5">
      <div className="flex gap-2 border-b">
        <button
          onClick={() => setTab("team")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "team"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-600 hover:text-slate-800"
          }`}
        >
          Team Performance
        </button>
        <button
          onClick={() => setTab("target")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "target"
              ? "border-emerald-600 text-emerald-700"
              : "border-transparent text-slate-600 hover:text-slate-800"
          }`}
        >
          Monthly Target
        </button>
      </div>

      {tab === "team" && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-sky-100 text-sky-900 px-3 py-1.5 rounded-md">
              Team Sales: <strong>{formatPKR(totalTeamSales)}</strong>
            </span>
            <span className="bg-emerald-100 text-emerald-900 px-3 py-1.5 rounded-md">
              Commission: <strong>{formatPKR(totalCommission)}</strong>
            </span>
            <span className="bg-slate-100 px-3 py-1.5 rounded-md">
              Net Payable: <strong>{formatPKR(totalNet)}</strong>
            </span>
            <span className="bg-slate-100 px-3 py-1.5 rounded-md">
              Paid: <strong>{formatPKR(totalPaid)}</strong>
            </span>
            <span className="bg-amber-100 text-amber-900 px-3 py-1.5 rounded-md">
              Remaining: <strong>{formatPKR(totalRemaining)}</strong>
            </span>
            <span className="bg-indigo-100 text-indigo-900 px-3 py-1.5 rounded-md">
              Target: <strong>{formatPKR(monthlyTarget)}</strong> &middot;{" "}
              <strong>{progressPct.toFixed(1)}%</strong>
            </span>
            <span className="bg-violet-100 text-violet-900 px-3 py-1.5 rounded-md">
              Commission base: <strong>{formatPKR(commissionBase)}</strong>
            </span>
          </div>

          <div className="flex flex-wrap gap-3 items-end justify-between bg-white border rounded-xl p-3">
            <div className="flex flex-wrap gap-3 items-end">
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">Employee</span>
                <select
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                  className="mt-1 border rounded-md px-2.5 py-1.5 text-sm bg-white min-w-[160px]"
                >
                  <option value="">All employees</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.name}>
                      {e.name} {e.isLead ? "(Lead)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">Status</span>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="mt-1 border rounded-md px-2.5 py-1.5 text-sm bg-white min-w-[120px]"
                >
                  <option value="">All statuses</option>
                  <option value="Pending">Pending</option>
                  <option value="Partial">Partial</option>
                  <option value="Paid">Paid</option>
                </select>
              </label>
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">Search</span>
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Name / client / description"
                    className="mt-1 pl-7 border rounded-md px-2.5 py-1.5 text-sm min-w-[200px]"
                  />
                </div>
              </label>
            </div>
            <button
              onClick={openAdd}
              disabled={loading}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-3 py-2 rounded-lg text-sm font-medium"
            >
              <Plus size={16} /> Add Sale
            </button>
          </div>

          {open && (
            <form
              onSubmit={saveEntry}
              className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-slate-800">
                  {editingEntry ? "Edit Sale Entry" : "New Sale Entry"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setEditingEntry(null);
                  }}
                >
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-slate-600">
                Commission (2.5%) is auto-added to this employee&apos;s payroll row.
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">Employee</span>
                  <select
                    value={form.employeeName}
                    onChange={(e) =>
                      setForm({ ...form, employeeName: e.target.value })
                    }
                    required
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                  >
                    <option value="">- Select employee -</option>
                    {employees
                      .filter((e) => !e.isLead)
                      .map((e) => (
                        <option key={e.id} value={e.name}>
                          {e.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">Tour Date</span>
                  <input
                    type="date"
                    value={form.tourDate}
                    onChange={(e) =>
                      setForm({ ...form, tourDate: e.target.value })
                    }
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">Client Name</span>
                  <input
                    value={form.clientName}
                    onChange={(e) =>
                      setForm({ ...form, clientName: e.target.value })
                    }
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs col-span-2">
                  <span className="text-slate-600 font-medium">Description</span>
                  <input
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                  />
                </label>
                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">
                    Sale Amount (PKR)
                  </span>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={(e) =>
                      setForm({ ...form, amount: e.target.value })
                    }
                    required
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                  />
                </label>
                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs">
                    <span className="text-slate-600 font-medium">Notes</span>
                    <input
                      value={form.notes}
                      onChange={(e) =>
                        setForm({ ...form, notes: e.target.value })
                      }
                      className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                    />
                  </label>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading || !form.employeeName}
                className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading
                  ? "Saving..."
                  : editingEntry
                    ? "Update Sale"
                    : "Save Sale"}
              </button>
            </form>
          )}

          {editingRow && (
            <form
              onSubmit={saveRow}
              className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-semibold text-slate-800">
                  Edit {editingRow.name}&apos;s row
                </h3>
                <button type="button" onClick={() => setEditingRow(null)}>
                  <X size={18} />
                </button>
              </div>
              <p className="text-xs text-slate-600">
                Every column is editable. Leave Net Payable blank to
                auto-calculate as Basic + Commission. Remaining is always
                Net minus Paid.
              </p>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">Role</span>
                  <select
                    value={rowForm.role}
                    onChange={(e) =>
                      setRowForm({
                        ...rowForm,
                        role: e.target.value as "Sales" | "Team Lead-Sales",
                      })
                    }
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                  >
                    <option value="Sales">Sales</option>
                    <option value="Team Lead-Sales">Team Lead-Sales</option>
                  </select>
                </label>

                <NumField
                  label="Basic Salary"
                  value={rowForm.basicSalary}
                  onChange={(v) => setRowForm({ ...rowForm, basicSalary: v })}
                />
                <NumField
                  label="Individual Sales"
                  value={rowForm.individualSales}
                  onChange={(v) =>
                    setRowForm({ ...rowForm, individualSales: v })
                  }
                />
                <NumField
                  label="Sale Base"
                  value={rowForm.saleBase}
                  onChange={(v) => setRowForm({ ...rowForm, saleBase: v })}
                />
                <NumField
                  label="Rate (%)"
                  value={rowForm.commissionRate}
                  onChange={(v) =>
                    setRowForm({ ...rowForm, commissionRate: v })
                  }
                />
                <NumField
                  label="Commission (PKR)"
                  value={rowForm.commissionAmt}
                  onChange={(v) =>
                    setRowForm({ ...rowForm, commissionAmt: v })
                  }
                />
                <NumField
                  label="Net Payable (blank = auto)"
                  value={rowForm.netPayable}
                  onChange={(v) => setRowForm({ ...rowForm, netPayable: v })}
                />
                <NumField
                  label="Amount Paid"
                  value={rowForm.amountPaid}
                  onChange={(v) => setRowForm({ ...rowForm, amountPaid: v })}
                />

                <label className="block text-xs">
                  <span className="text-slate-600 font-medium">Status</span>
                  <select
                    value={rowForm.status}
                    onChange={(e) =>
                      setRowForm({
                        ...rowForm,
                        status: e.target.value as
                          | "Pending"
                          | "Partial"
                          | "Paid",
                      })
                    }
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                  >
                    <option value="Pending">Pending</option>
                    <option value="Partial">Partial</option>
                    <option value="Paid">Paid</option>
                  </select>
                </label>

                <div className="col-span-2 md:col-span-3">
                  <label className="block text-xs">
                    <span className="text-slate-600 font-medium">Notes</span>
                    <input
                      value={rowForm.notes}
                      onChange={(e) =>
                        setRowForm({ ...rowForm, notes: e.target.value })
                      }
                      className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                    />
                  </label>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-3 text-xs text-slate-700 flex flex-wrap gap-4">
                <span>
                  Live Net: <strong>{formatPKR(previewNet)}</strong>
                  {rowForm.netPayable !== "" && (
                    <span className="text-slate-500">
                      {" "}
                      (overridden by Net Payable field)
                    </span>
                  )}
                </span>
                <span>
                  Remaining: <strong>{formatPKR(previewRemaining)}</strong>
                </span>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingRow(null)}
                  className="bg-slate-200 hover:bg-slate-300 text-slate-800 px-5 py-2 rounded-lg text-sm font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b">
                    {[
                      "Employee",
                      "Role",
                      "Basic",
                      "Individual Sales",
                      "Sale Base",
                      "Rate",
                      "Commission",
                      "Net Payable",
                      "Paid",
                      "Remaining",
                      "Status",
                      "Actions",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="text-center py-6 text-slate-400 text-sm"
                      >
                        No matching employees.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-slate-100 hover:bg-slate-50/70"
                      >
                        <td className="px-3 py-2 font-medium">{r.name}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              r.isLead
                                ? "bg-amber-100 text-amber-900 font-semibold"
                                : "bg-emerald-50 text-emerald-800"
                            }`}
                          >
                            {r.isLead ? "Team Lead-Sales" : "Sales"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.isLead ? "-" : formatPKR(r.basicSalary)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPKR(r.individualSales)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                          {formatPKR(r.saleBase)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {r.commissionRate}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">
                          {formatPKR(r.commissionAmt)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatPKR(r.netPayable)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-sky-700">
                          {formatPKR(r.amountPaid)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums font-medium ${
                            r.remaining > 0 ? "text-red-600" : "text-slate-500"
                          }`}
                        >
                          {formatPKR(r.remaining)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full ${
                              r.status === "Paid"
                                ? "bg-emerald-100 text-emerald-800"
                                : r.status === "Partial"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditRow(r)}
                            disabled={loading}
                            className="p-1.5 text-sky-600 hover:bg-sky-50 rounded disabled:opacity-40"
                            title="Edit full row"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeRow(r)}
                            disabled={loading}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1 disabled:opacity-40"
                            title="Delete commission + payroll row"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b flex justify-between items-center">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                Individual Sales Entries ({filteredEntries.length})
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/60 border-b">
                    {[
                      "Date",
                      "Employee",
                      "Client",
                      "Description",
                      "Amount",
                      "Notes",
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
                  {filteredEntries.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="text-center py-6 text-slate-400 text-sm"
                      >
                        No sales entries yet. Click Add Sale.
                      </td>
                    </tr>
                  ) : (
                    filteredEntries.map((s) => (
                      <tr key={s.id} className="border-b border-slate-100">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {s.tourDate
                            ? new Date(s.tourDate).toLocaleDateString("en-GB")
                            : "-"}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {s.employeeName}
                        </td>
                        <td className="px-3 py-2">{s.clientName || "-"}</td>
                        <td className="px-3 py-2 max-w-[240px] truncate">
                          {s.description || "-"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">
                          {formatPKR(s.amount)}
                        </td>
                        <td className="px-3 py-2 max-w-[200px] truncate">
                          {s.notes || "-"}
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditEntry(s)}
                            disabled={loading}
                            className="p-1.5 text-sky-600 hover:bg-sky-50 rounded disabled:opacity-40"
                            title="Edit entry"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeEntry(s.id)}
                            disabled={loading}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1 disabled:opacity-40"
                            title="Delete entry"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {tab === "target" && (
        <div className="bg-white border rounded-xl p-6 space-y-5 max-w-2xl">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">
              Monthly Sales Team Target
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              The target and commission base drive the Team Lead tiered pay:
              <br />- Team sales below <strong>Commission Base</strong>: flat
              55,000 only
              <br />- From Commission Base up to <strong>Monthly Target</strong>
              : 1.0% of team sales
              <br />- At or above Monthly Target: 2.5% of team sales
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-sky-50 rounded-lg p-3">
              <p className="text-xs text-slate-600">Current Team Sales</p>
              <p className="text-xl font-bold">{formatPKR(totalTeamSales)}</p>
            </div>
            <div className="bg-violet-50 rounded-lg p-3">
              <p className="text-xs text-slate-600">Commission Base</p>
              <p className="text-xl font-bold">{formatPKR(commissionBase)}</p>
            </div>
            <div className="bg-indigo-50 rounded-lg p-3">
              <p className="text-xs text-slate-600">Monthly Target</p>
              <p className="text-xl font-bold">{formatPKR(monthlyTarget)}</p>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>Progress to target</span>
              <span>{progressPct.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
              <div
                className={`h-3 rounded-full transition-all ${
                  progressPct >= 100
                    ? "bg-emerald-500"
                    : progressPct >= 70
                      ? "bg-amber-500"
                      : "bg-sky-500"
                }`}
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
          </div>

          <form onSubmit={saveTarget} className="space-y-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Monthly Target Amount (PKR)
              </span>
              <input
                type="number"
                value={targetForm.targetAmount}
                onChange={(e) =>
                  setTargetForm({
                    ...targetForm,
                    targetAmount: e.target.value,
                  })
                }
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-3 py-2 text-sm"
                required
              />
              <span className="text-xs text-slate-500 mt-1 block">
                1 crore = 10,000,000 &middot; 1.2 crore = 12,000,000
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">
                Commission Base Amount (PKR)
              </span>
              <input
                type="number"
                value={targetForm.commissionBaseAmount}
                onChange={(e) =>
                  setTargetForm({
                    ...targetForm,
                    commissionBaseAmount: e.target.value,
                  })
                }
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-3 py-2 text-sm"
                required
              />
              <span className="text-xs text-slate-500 mt-1 block">
                Team sales must reach this amount before the Team Lead moves
                from the flat 55,000 to the 1.0% tier. Default: 7,000,000 (70
                lacs).
              </span>
            </label>

            <label className="block text-sm">
              <span className="font-medium text-slate-700">Notes</span>
              <textarea
                value={targetForm.notes}
                onChange={(e) =>
                  setTargetForm({ ...targetForm, notes: e.target.value })
                }
                rows={2}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-3 py-2 text-sm"
                placeholder="Optional context for this target"
              />
            </label>

            <button
              type="submit"
              disabled={savingTarget}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              {savingTarget && <Loader2 size={16} className="animate-spin" />}
              {savingTarget ? "Saving..." : "Save Target & Commission Base"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
      />
    </label>
  );
}
