"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { formatPKR } from "@/lib/utils";

type Txn = {
  id: string;
  date: string;
  description: string;
  category: string;
  subCategory?: string | null;
  party?: string | null;
  tripRef?: string | null;
  debit: number;
  credit: number;
  paymentMethod?: string | null;
  bankAccount?: string | null;
  status: string;
  enteredBy?: string | null;
  notes?: string | null;
};

const CATEGORIES = [
  "Client Receipt",
  "Revenue",
  "Supplier Payment",
  "Hotel Payment",
  "Transport Payment",
  "Ticketing Payment",
  "Salary Payment",
  "Commission Payment",
  "Refund to Client",
  "Supplier Advance",
  "Employee Loan",
  "Office Expense",
  "Marketing Expense",
  "Owner Capital",
  "Owner Withdrawal",
  "Bank Transfer",
  "Other",
];

const empty = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  category: "Client Receipt",
  subCategory: "",
  party: "",
  tripRef: "",
  debit: "",
  credit: "",
  paymentMethod: "Bank",
  bankAccount: "Meezan / Faisal",
  status: "Completed",
  enteredBy: "",
  notes: "",
};

export function TransactionManager({
  periodId,
  txns,
}: {
  periodId: string;
  txns: Txn[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty);

  function openAdd() {
    setEditing(null);
    setForm({ ...empty, date: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  }

  function openEdit(t: Txn) {
    setEditing(t);
    setForm({
      date: new Date(t.date).toISOString().slice(0, 10),
      description: t.description || "",
      category: t.category || "Other",
      subCategory: t.subCategory || "",
      party: t.party || "",
      tripRef: t.tripRef || "",
      debit: String(t.debit || 0),
      credit: String(t.credit || 0),
      paymentMethod: t.paymentMethod || "Bank",
      bankAccount: t.bankAccount || "Meezan / Faisal",
      status: t.status || "Completed",
      enteredBy: t.enteredBy || "",
      notes: t.notes || "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        periodId,
        debit: parseFloat(form.debit) || 0,
        credit: parseFloat(form.credit) || 0,
      };
      const res = await fetch("/api/transactions", {
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
    if (!confirm("Delete this transaction? Bank balance will be reversed.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  const totalDebit = txns.reduce((s, t) => s + t.debit, 0);
  const totalCredit = txns.reduce((s, t) => s + t.credit, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 text-sm">
          <span className="bg-slate-100 px-3 py-1.5 rounded-md">
            Debits: <strong>{formatPKR(totalDebit)}</strong>
          </span>
          <span className="bg-slate-100 px-3 py-1.5 rounded-md">
            Credits: <strong>{formatPKR(totalCredit)}</strong>
          </span>
          <span
            className={`px-3 py-1.5 rounded-md ${
              totalDebit - totalCredit === 0
                ? "bg-emerald-100 text-emerald-800"
                : "bg-amber-100 text-amber-800"
            }`}
          >
            Balance (D-C): <strong>{formatPKR(totalDebit - totalCredit)}</strong>
          </span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Transaction
        </button>
      </div>

      {open && (
        <form onSubmit={save} className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {editing ? "Edit Transaction" : "New Transaction"} — Category controls cascade updates
            </h3>
            <button type="button" onClick={() => setOpen(false)}><X size={18} /></button>
          </div>
          <p className="text-xs text-slate-600">
            Client Receipt reduces Receivable · Supplier/Hotel/Transport Payment reduces Payable ·
            Salary/Commission marks Paid · Office/Marketing creates expense · Bank balance updates automatically
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
            <Field label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} required />
            <Select label="Category (controls cascade)" value={form.category} onChange={(v) => setForm({ ...form, category: v })} options={CATEGORIES} />
            <Field label="Sub-Category" value={form.subCategory} onChange={(v) => setForm({ ...form, subCategory: v })} />
            <Field label="Client / Vendor / Employee" value={form.party} onChange={(v) => setForm({ ...form, party: v })} />
            <Field label="Trip / Booking Ref" value={form.tripRef} onChange={(v) => setForm({ ...form, tripRef: v })} />
            <Field label="Debit — money IN (PKR)" type="number" value={form.debit} onChange={(v) => setForm({ ...form, debit: v })} />
            <Field label="Credit — money OUT (PKR)" type="number" value={form.credit} onChange={(v) => setForm({ ...form, credit: v })} />
            <Select label="Payment Method" value={form.paymentMethod} onChange={(v) => setForm({ ...form, paymentMethod: v })} options={["Bank","Cash","Jazzcash","Easypaisa","Cheque","Other"]} />
            <Select label="Bank / Cash Account" value={form.bankAccount} onChange={(v) => setForm({ ...form, bankAccount: v })} options={["HBL Main","Meezan / Faisal","UBL","Easypaisa","Jazzcash","Petty Cash"]} />
            <Select label="Status" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["Pending","Completed","Cancelled"]} />
            <Field label="Entered By" value={form.enteredBy} onChange={(v) => setForm({ ...form, enteredBy: v })} />
          </div>
          <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
          <button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium">
            {loading ? "Saving..." : editing ? "Update" : "Save Transaction"}
          </button>
        </form>
      )}

      {txns.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-500 text-sm">No transactions yet.</div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {["Date","Description","Category","Party","Debit","Credit","Account","Status","Actions"].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(t.date).toLocaleDateString("en-GB")}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{t.description}</td>
                    <td className="px-3 py-2">{t.category}</td>
                    <td className="px-3 py-2">{t.party || "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.debit ? formatPKR(t.debit) : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.credit ? formatPKR(t.credit) : "—"}</td>
                    <td className="px-3 py-2">{t.bankAccount || "—"}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(t)} className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"><Pencil size={15} /></button>
                      <button onClick={() => remove(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1"><Trash2 size={15} /></button>
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

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
    </label>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
