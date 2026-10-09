"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Plus, X, Trash2, Search } from "lucide-react";
import { formatPKR } from "@/lib/utils";

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

export function SalesTeamPanel({
  periodId,
  rows,
  totalTeamSales,
  employees,
  salesEntries,
}: {
  periodId: string;
  rows: Row[];
  totalTeamSales: number;
  employees: Employee[];
  salesEntries: SaleEntry[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [searchText, setSearchText] = useState("");

  // New sale form
  const [form, setForm] = useState({
    employeeName: "",
    tourDate: new Date().toISOString().slice(0, 10),
    description: "",
    clientName: "",
    amount: "",
    notes: "",
  });

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

  function openAdd() {
    setForm({
      employeeName: employees[0]?.name || "",
      tourDate: new Date().toISOString().slice(0, 10),
      description: "",
      clientName: "",
      amount: "",
      notes: "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const amount = parseFloat(form.amount) || 0;
      const res = await fetch("/api/sales-team/entry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          employeeName: form.employeeName,
          tourDate: form.tourDate,
          description: form.description,
          clientName: form.clientName,
          amount,
          notes: form.notes,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpen(false);
      router.refresh();
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
      const res = await fetch(`/api/sales-team/entry?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* KPI strip */}
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
      </div>

      {/* Filter bar + Add Sale */}
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
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Sale
        </button>
      </div>

      {/* New Sale form */}
      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">New Sale Entry</h3>
            <button type="button" onClick={() => setOpen(false)}>
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
                onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
                required
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              >
                <option value="">— Select employee —</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.name}>
                    {e.name} {e.isLead ? "(Team Lead)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Tour Date</span>
              <input
                type="date"
                value={form.tourDate}
                onChange={(e) => setForm({ ...form, tourDate: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Client Name</span>
              <input
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs col-span-2">
              <span className="text-slate-600 font-medium">Description</span>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Sale Amount (PKR)</span>
              <input
                type="number"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                required
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <div className="col-span-2 md:col-span-3">
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">Notes</span>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
                />
              </label>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading || !form.employeeName}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {loading ? "Saving…" : "Save Sale"}
          </button>
        </form>
      )}

      {/* Aggregated sales team table */}
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
                  <td colSpan={11} className="text-center py-6 text-slate-400 text-sm">
                    No matching employees.
                  </td>
                </tr>
              ) : (
                filteredRows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/70">
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
                      {r.isLead ? "—" : formatPKR(r.basicSalary)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPKR(r.individualSales)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {formatPKR(r.saleBase)}
                    </td>
                    <td className="px-3 py-2 text-right">{r.commissionRate}%</td>
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sale entries list */}
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
                {["Date", "Employee", "Client", "Description", "Amount", "Notes", ""].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-6 text-slate-400 text-sm">
                    No sales entries yet. Click Add Sale.
                  </td>
                </tr>
              ) : (
                filteredEntries.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {s.tourDate ? new Date(s.tourDate).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-3 py-2 font-medium">{s.employeeName}</td>
                    <td className="px-3 py-2">{s.clientName || "—"}</td>
                    <td className="px-3 py-2 max-w-[240px] truncate">
                      {s.description || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700 font-medium">
                      {formatPKR(s.amount)}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{s.notes || "—"}</td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removeEntry(s.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded"
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
    </div>
  );
}