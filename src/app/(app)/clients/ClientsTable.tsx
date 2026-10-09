"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Pencil, Trash2, X } from "lucide-react";
import { formatPKR } from "@/lib/utils";

type Row = {
  id: string;
  name: string;
  phone: string | null;
  contact: string | null;
  email: string | null;
  notes: string | null;
  totalPackage: number;
  amountPaid: number;
  amountDue: number;
  status: string;
  tripInfo: string;
};

export function ClientsTable({
  rows,
  periodId,
}: {
  rows: Row[];
  periodId: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    contact: "",
    email: "",
    notes: "",
    totalPackage: "",
    amountPaid: "",
  });

  function openEdit(r: Row) {
    if (r.id.startsWith("recv-")) return;
    setEditing(r);
    setForm({
      name: r.name || "",
      phone: r.phone || "",
      contact: r.contact || "",
      email: r.email || "",
      notes: r.notes || "",
      totalPackage: String(r.totalPackage || 0),
      amountPaid: String(r.amountPaid || 0),
    });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/manage?periodId=${periodId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editing.id,
          name: form.name,
          phone: form.phone || null,
          contact: form.contact || null,
          email: form.email || null,
          notes: form.notes || null,
          totalPackage: parseFloat(form.totalPackage) || 0,
          amountPaid: parseFloat(form.amountPaid) || 0,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${res.statusText}: ${text}`);
      }
      setEditing(null);
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Save failed:\n" + msg);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this client and all its ledger/receivable records?")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/manage?id=${id}`, { method: "DELETE" });
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
      {editing && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">Edit Client: {editing.name}</h3>
            <button type="button" onClick={() => setEditing(null)}>
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Input label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
            <Input label="Contact / Ref" value={form.contact} onChange={(v) => setForm({ ...form, contact: v })} />
            <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
            <Input
              label="Total Package (PKR)"
              type="number"
              value={form.totalPackage}
              onChange={(v) => setForm({ ...form, totalPackage: v })}
            />
            <Input
              label="Amount Paid (PKR)"
              type="number"
              value={form.amountPaid}
              onChange={(v) => setForm({ ...form, amountPaid: v })}
            />
            <div className="col-span-2 md:col-span-3">
              <Input label="Notes" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} />
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {loading ? "Saving…" : "Update"}
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-500 text-sm">
          No clients yet. Add from Transactions or Receivables.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {[
                    "Client Name",
                    "Phone",
                    "Trip / Package",
                    "Total Package",
                    "Amount Paid",
                    "Amount Due",
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
                {rows.map((r) => {
                  const editable = !r.id.startsWith("recv-");
                  const href = `/clients/${r.id}?period=${periodId}`;
                  return (
                    <tr key={r.id} className="border-b border-slate-100 hover:bg-emerald-50/40">
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {editable ? (
                          <Link href={href} className="text-slate-900 hover:text-emerald-700">
                            {r.name}
                          </Link>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {r.phone || r.contact || "—"}
                      </td>
                      <td className="px-3 py-3 max-w-[180px] truncate">{r.tripInfo}</td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatPKR(r.totalPackage)}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums text-emerald-700">
                        {formatPKR(r.amountPaid)}
                      </td>
                      <td
                        className={`px-3 py-3 text-right tabular-nums font-medium ${
                          r.amountDue > 0 ? "text-red-600" : "text-slate-500"
                        }`}
                      >
                        {formatPKR(r.amountDue)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.status === "Settled" || r.status === "Completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : r.status === "Partial"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap">
                        {editable && (
                          <>
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
                            <Link
                              href={href}
                              className="inline-block p-1.5 text-slate-400 hover:text-emerald-600 ml-1"
                            >
                              <ChevronRight size={16} />
                            </Link>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Input({
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