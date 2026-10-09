"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, X, Pencil, Trash2 } from "lucide-react";
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

export function SalesTeamPanel({
  periodId,
  rows,
  totalTeamSales,
}: {
  periodId: string;
  rows: Row[];
  totalTeamSales: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    employeeName: "",
    individualSales: "",
    commissionAmt: "",
    amountPaid: "",
    notes: "",
  });

  const totalCommission = rows.reduce((s, r) => s + r.commissionAmt, 0);
  const totalNet = rows.reduce((s, r) => s + r.netPayable, 0);
  const totalPaid = rows.reduce((s, r) => s + r.amountPaid, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);

  function openAdd() {
    setEditing(null);
    setForm({
      employeeName: "",
      individualSales: "0",
      commissionAmt: "0",
      amountPaid: "0",
      notes: "",
    });
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditing(r);
    setForm({
      employeeName: r.name,
      individualSales: String(r.individualSales),
      commissionAmt: String(r.commissionAmt),
      amountPaid: String(r.amountPaid),
      notes: "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      // Update commission record + payroll amountPaid
      const res = await fetch("/api/sales-team/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          employeeName: form.employeeName,
          individualSales: parseFloat(form.individualSales) || 0,
          commissionAmt: parseFloat(form.commissionAmt) || 0,
          amountPaid: parseFloat(form.amountPaid) || 0,
          notes: form.notes || null,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Save failed:\n" + msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-3 text-sm">
          <span className="bg-sky-100 text-sky-900 px-3 py-1.5 rounded-md">
            Total Team Sales: <strong>{formatPKR(totalTeamSales)}</strong>
          </span>
          <span className="bg-emerald-100 text-emerald-900 px-3 py-1.5 rounded-md">
            Total Commission: <strong>{formatPKR(totalCommission)}</strong>
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
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Sales Entry
        </button>
      </div>

      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {editing ? "Edit Sales Entry" : "New Sales Entry"}
            </h3>
            <button type="button" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block text-xs col-span-2">
              <span className="text-slate-600 font-medium">Employee Name</span>
              <input
                value={form.employeeName}
                onChange={(e) => setForm({ ...form, employeeName: e.target.value })}
                required
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Individual Sales (PKR)</span>
              <input
                type="number"
                value={form.individualSales}
                onChange={(e) => setForm({ ...form, individualSales: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Commission Amount (PKR)</span>
              <input
                type="number"
                value={form.commissionAmt}
                onChange={(e) => setForm({ ...form, commissionAmt: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Amount Paid (PKR)</span>
              <input
                type="number"
                value={form.amountPaid}
                onChange={(e) => setForm({ ...form, amountPaid: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
            <label className="block text-xs col-span-2">
              <span className="text-slate-600 font-medium">Notes</span>
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {loading ? "Saving…" : editing ? "Update" : "Save"}
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-500 text-sm">
          No sales team members. Add employees with role "Sales" in Settings.
        </div>
      ) : (
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
                    "Rate %",
                    "Commission",
                    "Net Payable",
                    "Paid",
                    "Remaining",
                    "Status",
                    "",
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
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
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
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => openEdit(r)}
                        className="inline-flex p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                      >
                        <Pencil size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}