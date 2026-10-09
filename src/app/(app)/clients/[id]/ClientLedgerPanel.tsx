"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { formatPKR } from "@/lib/utils";

type LedgerRow = {
  id: string;
  tourDate: string | null;
  description: string | null;
  category: string | null;
  subCategory: string | null;
  hotel: string | null;
  debit: number;
  credit: number;
  status: string | null;
  receiptRef: string | null;
  enteredBy: string | null;
  notes: string | null;
};

const empty = {
  tourDate: new Date().toISOString().slice(0, 10),
  description: "",
  category: "",
  subCategory: "",
  hotel: "",
  debit: "0",
  credit: "0",
  status: "Open",
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
  rows: LedgerRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<LedgerRow | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);

  const totalDebit = rows.reduce((s, r) => s + (r.debit || 0), 0);
  const totalCredit = rows.reduce((s, r) => s + (r.credit || 0), 0);
  const balance = totalDebit - totalCredit;

  function openAdd() {
    setEditing(null);
    setForm({ ...empty, tourDate: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  function openEdit(r: LedgerRow) {
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
      alert("Failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this ledger row?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/client-ledger?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 text-sm">
          <span className="bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-md">
            Total Debit: <strong>{formatPKR(totalDebit)}</strong>
          </span>
          <span className="bg-sky-50 text-sky-800 px-3 py-1.5 rounded-md">
            Total Credit: <strong>{formatPKR(totalCredit)}</strong>
          </span>
          <span
            className={`px-3 py-1.5 rounded-md ${
              balance >= 0
                ? "bg-emerald-100 text-emerald-900"
                : "bg-red-100 text-red-900"
            }`}
          >
            Balance: <strong>{formatPKR(balance)}</strong>
          </span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Ledger Row
        </button>
      </div>

      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {editing ? "Edit Row" : "New Ledger Row"}
            </h3>
            <button type="button" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Tour Date" type="date" value={form.tourDate}
              onChange={(v) => setForm({ ...form, tourDate: v })} />
            <Field label="Description" value={form.description}
              onChange={(v) => setForm({ ...form, description: v })} />
            <Field label="Category" value={form.category}
              onChange={(v) => setForm({ ...form, category: v })} />
            <Field label="Sub-Category" value={form.subCategory}
              onChange={(v) => setForm({ ...form, subCategory: v })} />
            <Field label="Hotel / Vendor" value={form.hotel}
              onChange={(v) => setForm({ ...form, hotel: v })} />
            <Field label="Debit (money in)" type="number" value={form.debit}
              onChange={(v) => setForm({ ...form, debit: v })} />
            <Field label="Credit (money out)" type="number" value={form.credit}
              onChange={(v) => setForm({ ...form, credit: v })} />
            <Field label="Status" value={form.status}
              onChange={(v) => setForm({ ...form, status: v })} />
            <Field label="Receipt Ref" value={form.receiptRef}
              onChange={(v) => setForm({ ...form, receiptRef: v })} />
            <Field label="Entered By" value={form.enteredBy}
              onChange={(v) => setForm({ ...form, enteredBy: v })} />
            <Field label="Notes" value={form.notes}
              onChange={(v) => setForm({ ...form, notes: v })} />
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
          No ledger rows yet for {clientName}.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {["Tour Date","Description","Category","Hotel/Vendor","Debit","Credit","Status","Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.tourDate ? new Date(r.tourDate).toLocaleDateString("en-GB") : "—"}
                    </td>
                    <td className="px-3 py-2 max-w-[220px] truncate">{r.description || "—"}</td>
                    <td className="px-3 py-2">{r.category || r.subCategory || "—"}</td>
                    <td className="px-3 py-2">{r.hotel || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {r.debit ? formatPKR(r.debit) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-sky-700">
                      {r.credit ? formatPKR(r.credit) : "—"}
                    </td>
                    <td className="px-3 py-2">{r.status || "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(r)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(r.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1">
                        <Trash2 size={15} />
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

function Field({
  label, value, onChange, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}