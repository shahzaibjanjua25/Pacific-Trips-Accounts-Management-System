"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPKR } from "@/lib/utils";
import { Plus, Pencil, Trash2, X } from "lucide-react";

type Row = {
  id: string;
  tourDate?: string | null;
  description?: string | null;
  category?: string | null;
  subCategory?: string | null;
  hotel?: string | null;
  debit: number;
  credit: number;
  status?: string | null;
  receiptRef?: string | null;
  enteredBy?: string | null;
  notes?: string | null;
};

const empty = {
  tourDate: new Date().toISOString().slice(0, 10),
  description: "",
  category: "",
  subCategory: "",
  hotel: "",
  debit: "0",
  credit: "0",
  status: "",
  receiptRef: "",
  enteredBy: "",
  notes: "",
};

export function ClientLedgerPanel({
  clientId,
  clientName,
  rows,
}: {
  clientId: string;
  clientName: string;
  rows: Row[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);

  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);

  function openAdd() {
    setEditing(null);
    setForm({ ...empty, tourDate: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  function openEdit(r: Row) {
    setEditing(r);
    setForm({
      tourDate: r.tourDate ? new Date(r.tourDate).toISOString().slice(0, 10) : "",
      description: r.description || "",
      category: r.category || "",
      subCategory: r.subCategory || "",
      hotel: r.hotel || "",
      debit: String(r.debit || 0),
      credit: String(r.credit || 0),
      status: r.status || "",
      receiptRef: r.receiptRef || "",
      enteredBy: r.enteredBy || "",
      notes: r.notes || "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        clientId,
        clientName,
        debit: parseFloat(form.debit) || 0,
        credit: parseFloat(form.credit) || 0,
      };
      const res = await fetch("/api/client-ledger", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
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

  async function remove(id: string) {
    if (!confirm("Delete this ledger line?")) return;
    await fetch(`/api/client-ledger?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Client Ledger — Balance Sheet</h2>
          <p className="text-xs text-slate-500">
            Debit = money in / package · Credit = costs / money out · Balance = Debit − Credit
          </p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Line
        </button>
      </div>

      {open && (
        <form onSubmit={save} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <div className="flex justify-between">
            <h3 className="font-semibold text-sm">{editing ? "Edit line" : "New ledger line"}</h3>
            <button type="button" onClick={() => setOpen(false)}>
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {(
              [
                ["tourDate", "Tour Date", "date"],
                ["description", "Description", "text"],
                ["category", "Category", "text"],
                ["subCategory", "Sub-Category", "text"],
                ["hotel", "Hotel / Detail", "text"],
                ["debit", "Debit (PKR)", "number"],
                ["credit", "Credit (PKR)", "number"],
                ["status", "Status", "text"],
                ["receiptRef", "Receipt Ref", "text"],
                ["enteredBy", "Entered By", "text"],
                ["notes", "Notes", "text"],
              ] as const
            ).map(([key, label, type]) => (
              <label key={key} className="block text-xs">
                <span className="text-slate-600 font-medium">{label}</span>
                <input
                  type={type}
                  value={form[key]}
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2 py-1.5 text-sm"
                />
              </label>
            ))}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 text-white px-4 py-1.5 rounded-lg text-sm"
          >
            {loading ? "Saving…" : "Save"}
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                {[
                  "Tour Date",
                  "Description",
                  "Hotel / Detail",
                  "Debit",
                  "Credit",
                  "Status",
                  "Notes",
                  "",
                ].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-semibold text-slate-600 uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No ledger lines yet. Add payment, hotel costs, transport, etc.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    {r.tourDate ? new Date(r.tourDate).toLocaleDateString("en-GB") : "—"}
                  </td>
                  <td className="px-3 py-2">{r.description || "—"}</td>
                  <td className="px-3 py-2">{r.hotel || r.subCategory || "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.debit ? formatPKR(r.debit) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.credit ? formatPKR(r.credit) : "—"}
                  </td>
                  <td className="px-3 py-2">{r.status || "—"}</td>
                  <td className="px-3 py-2 max-w-[120px] truncate text-xs text-slate-500">
                    {r.notes || ""}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(r)} className="p-1 text-sky-600">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(r.id)} className="p-1 text-red-600 ml-1">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 font-semibold border-t">
                <td className="px-3 py-2" colSpan={3}>
                  TOTALS
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPKR(totalDebit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{formatPKR(totalCredit)}</td>
                <td className="px-3 py-2" colSpan={3}>
                  Balance (D−C): {formatPKR(totalDebit - totalCredit)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
