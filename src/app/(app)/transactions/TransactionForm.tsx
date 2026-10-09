"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function TransactionForm({ periodId }: { periodId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: "",
    category: "Expense",
    subCategory: "",
    party: "",
    tripRef: "",
    debit: "",
    credit: "",
    paymentMethod: "Bank",
    bankAccount: "Meezan",
    status: "Completed",
    enteredBy: "",
    notes: "",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          periodId,
          debit: parseFloat(form.debit) || 0,
          credit: parseFloat(form.credit) || 0,
        }),
      });
      if (res.ok) {
        setOpen(false);
        setForm({
          ...form,
          description: "",
          debit: "",
          credit: "",
          notes: "",
        });
        router.refresh();
      } else {
        alert("Failed to save transaction");
      }
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      >
        + Add Transaction
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4"
    >
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-800">New Transaction (Yellow = Input)</h3>
        <button type="button" onClick={() => setOpen(false)} className="text-slate-500 text-sm">
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Date" type="date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} required />
        <Field label="Description" value={form.description} onChange={(v) => setForm({ ...form, description: v })} required />
        <Select
          label="Category"
          value={form.category}
          onChange={(v) => setForm({ ...form, category: v })}
          options={["Revenue", "Expense", "Transfer", "Loan", "Salary", "Commission", "Refund", "Advance", "Owner"]}
        />
        <Field label="Sub-Category" value={form.subCategory} onChange={(v) => setForm({ ...form, subCategory: v })} />
        <Field label="Client / Vendor / Employee" value={form.party} onChange={(v) => setForm({ ...form, party: v })} />
        <Field label="Trip / Booking Ref" value={form.tripRef} onChange={(v) => setForm({ ...form, tripRef: v })} />
        <Field label="Debit (PKR)" type="number" value={form.debit} onChange={(v) => setForm({ ...form, debit: v })} />
        <Field label="Credit (PKR)" type="number" value={form.credit} onChange={(v) => setForm({ ...form, credit: v })} />
        <Select
          label="Payment Method"
          value={form.paymentMethod}
          onChange={(v) => setForm({ ...form, paymentMethod: v })}
          options={["Bank", "Cash", "Jazzcash", "Easypaisa", "Cheque", "Other"]}
        />
        <Select
          label="Bank / Cash Account"
          value={form.bankAccount}
          onChange={(v) => setForm({ ...form, bankAccount: v })}
          options={["HBL Main", "Meezan", "UBL", "Faisal", "Easypaisa", "Jazzcash", "Petty Cash"]}
        />
        <Select
          label="Status"
          value={form.status}
          onChange={(v) => setForm({ ...form, status: v })}
          options={["Pending", "Completed", "Cancelled"]}
        />
        <Field label="Entered By" value={form.enteredBy} onChange={(v) => setForm({ ...form, enteredBy: v })} />
      </div>
      <Field label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
      <button
        type="submit"
        disabled={loading}
        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
      >
        {loading ? "Saving…" : "Save Transaction"}
      </button>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
