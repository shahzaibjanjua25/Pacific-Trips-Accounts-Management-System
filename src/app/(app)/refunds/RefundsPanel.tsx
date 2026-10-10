"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { formatPKR } from "@/lib/utils";

type Client = { id: string; name: string };

type RefundRow = {
  id: string;
  clientName: string;
  amount: number;
  reason: string | null;
  status: string;
  paidDate: string | null;
  tripRef: string | null;
  notes: string | null;
};

const empty = {
  clientName: "",
  amount: "0",
  reason: "",
  status: "Pending",
  paidDate: "",
  tripRef: "",
  notes: "",
};

export function RefundsPanel({
  periodId,
  clients,
  rows,
}: {
  periodId: string;
  clients: Client[];
  rows: RefundRow[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RefundRow | null>(null);
  const [form, setForm] = useState(empty);
  const [loading, setLoading] = useState(false);

  // If a client isn't in the master list (legacy data), still show it
  const clientNames = clients.map((c) => c.name);
  const extraNames = Array.from(
    new Set(
      rows
        .map((r) => r.clientName)
        .filter((n) => n && !clientNames.includes(n))
    )
  );

  function openAdd() {
    setEditing(null);
    setForm({
      ...empty,
      clientName: clients[0]?.name || "",
      paidDate: "",
    });
    setOpen(true);
  }

  function openEdit(r: RefundRow) {
    setEditing(r);
    setForm({
      clientName: r.clientName || "",
      amount: String(r.amount || 0),
      reason: r.reason || "",
      status: r.status || "Pending",
      paidDate: r.paidDate ? r.paidDate.slice(0, 10) : "",
      tripRef: r.tripRef || "",
      notes: r.notes || "",
    });
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        periodId,
        clientName: form.clientName,
        amount: parseFloat(form.amount) || 0,
        reason: form.reason || null,
        status: form.status,
        paidDate: form.paidDate || null,
        tripRef: form.tripRef || null,
        notes: form.notes || null,
      };
      const res = await fetch("/api/refunds", {
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
    if (!confirm("Delete this refund?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/refunds?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  const totalPending = rows
    .filter((r) => r.status === "Pending")
    .reduce((s, r) => s + r.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 text-sm">
          <span className="bg-slate-100 px-3 py-1.5 rounded-md">
            Total refunds: <strong>{rows.length}</strong>
          </span>
          <span className="bg-amber-100 text-amber-900 px-3 py-1.5 rounded-md">
            Pending: <strong>{formatPKR(totalPending)}</strong>
          </span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Refund
        </button>
      </div>

      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {editing ? "Edit Refund" : "New Refund"}
            </h3>
            <button type="button" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block text-xs col-span-2">
              <span className="text-slate-600 font-medium">Client</span>
              <select
                value={form.clientName}
                onChange={(e) => setForm({ ...form, clientName: e.target.value })}
                required
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">— Select client —</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
                {extraNames.map((n) => (
                  <option key={`legacy-${n}`} value={n}>
                    {n} (legacy)
                  </option>
                ))}
              </select>
            </label>

            <Field
              label="Refund Amount (PKR)"
              type="number"
              value={form.amount}
              onChange={(v) => setForm({ ...form, amount: v })}
              required
            />

            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Status</span>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Pending">Pending</option>
                <option value="Paid">Paid</option>
              </select>
            </label>

            <Field
              label="Reason"
              value={form.reason}
              onChange={(v) => setForm({ ...form, reason: v })}
            />
            <Field
              label="Paid Date"
              type="date"
              value={form.paidDate}
              onChange={(v) => setForm({ ...form, paidDate: v })}
            />
            <Field
              label="Trip / Booking Ref"
              value={form.tripRef}
              onChange={(v) => setForm({ ...form, tripRef: v })}
            />
            <Field
              label="Notes"
              value={form.notes}
              onChange={(v) => setForm({ ...form, notes: v })}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !form.clientName}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {loading ? "Saving…" : editing ? "Update" : "Save"}
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-500 text-sm">
          No refunds yet. Click Add Refund.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {[
                    "Client",
                    "Amount",
                    "Reason",
                    "Status",
                    "Paid Date",
                    "Trip Ref",
                    "Notes",
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
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-3 py-2 font-medium">{r.clientName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPKR(r.amount)}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate">
                      {r.reason || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          r.status === "Paid"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-800"
                        }`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {r.paidDate
                        ? new Date(r.paidDate).toLocaleDateString("en-GB")
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{r.tripRef || "—"}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">
                      {r.notes || "—"}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                        title="Edit"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => remove(r.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1"
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
        </div>
      )}
    </div>
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