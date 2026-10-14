"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronRight, Pencil, Trash2, X, Plus } from "lucide-react";
import { formatPKR } from "@/lib/utils";
import { LookupSelect } from "@/components/LookupSelect";

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
  salesperson: string | null;
  // Receivable-side fields (nullable if client has no receivable yet)
  bookingDate: string | null;
  dueDate: string | null;
  tripStart: string | null;
  tripDates: string | null;
  destination: string | null;
  discounts: number;
  additionalCharges: number;
  finalSettlement: number | null;
  receivableNotes: string | null;
};

const emptyForm = {
  // Client master
  name: "",
  phone: "",
  contact: "",
  email: "",
  notes: "",
  // Receivable
  totalPackage: "",
  amountPaid: "",
  salesperson: "",
  bookingDate: "",
  dueDate: "",
  tripStart: "",
  tripDates: "",
  destination: "",
  discounts: "",
  additionalCharges: "",
  finalSettlement: "",
  status: "Open",
  receivableNotes: "",
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
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function openAdd() {
    setEditing(null);
    setAdding(true);
    setForm({ ...emptyForm });
  }

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
      salesperson: r.salesperson || "",
      bookingDate: r.bookingDate ? r.bookingDate.slice(0, 10) : "",
      dueDate: r.dueDate ? r.dueDate.slice(0, 10) : "",
      tripStart: r.tripStart ? r.tripStart.slice(0, 10) : "",
      tripDates: r.tripDates || "",
      destination: r.destination || "",
      discounts: String(r.discounts || 0),
      additionalCharges: String(r.additionalCharges || 0),
      finalSettlement:
        r.finalSettlement != null ? String(r.finalSettlement) : "",
      status: r.status || "Open",
      receivableNotes: r.receivableNotes || "",
    });
  }

  function closeForm() {
    setEditing(null);
    setAdding(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing && !adding) return;
    setLoading(true);
    try {
      // Common payload for both Client master and Receivable fields
      const common = {
        name: form.name,
        phone: form.phone || null,
        contact: form.contact || null,
        email: form.email || null,
        notes: form.notes || null,
        totalPackage: parseFloat(form.totalPackage) || 0,
        amountPaid: parseFloat(form.amountPaid) || 0,
        salesperson: form.salesperson || null,
        bookingDate: form.bookingDate || null,
        dueDate: form.dueDate || null,
        tripStart: form.tripStart || null,
        tripDates: form.tripDates || null,
        destination: form.destination || null,
        discounts: parseFloat(form.discounts) || 0,
        additionalCharges: parseFloat(form.additionalCharges) || 0,
        finalSettlement:
          form.finalSettlement === ""
            ? null
            : parseFloat(form.finalSettlement) || 0,
        status: form.status || "Open",
        receivableNotes: form.receivableNotes || null,
      };

      if (adding) {
        const res = await fetch(`/api/clients/manage?periodId=${periodId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...common, periodId }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status} ${res.statusText}: ${text}`);
        }
        setAdding(false);
      } else if (editing) {
        const res = await fetch(`/api/clients/manage?periodId=${periodId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...common }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`${res.status} ${res.statusText}: ${text}`);
        }
        setEditing(null);
      }
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert("Save failed:\n" + msg);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this client and all its ledger/receivable records?"))
      return;
    setLoading(true);
    try {
      const res = await fetch(`/api/clients/manage?id=${id}`, {
        method: "DELETE",
      });
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
      {(editing || adding) && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {adding ? "Add Client" : `Edit Client: ${editing?.name}`}
            </h3>
            <button type="button" onClick={closeForm}>
              <X size={18} />
            </button>
          </div>

          {/* ─── Client master ─── */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Client Details
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input
                label="Name"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
                required
              />
              <Input
                label="Phone"
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
              />
              <Input
                label="Contact / Ref"
                value={form.contact}
                onChange={(v) => setForm({ ...form, contact: v })}
              />
              <Input
                label="Email"
                value={form.email}
                onChange={(v) => setForm({ ...form, email: v })}
              />
              <div className="col-span-2 md:col-span-3">
                <Input
                  label="Client Notes"
                  value={form.notes}
                  onChange={(v) => setForm({ ...form, notes: v })}
                />
              </div>
            </div>
          </section>

          {/* ─── Sale / package ─── */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Package & Payment
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
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
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">
                  Salesperson (who brought this client)
                </span>
                <div className="mt-1">
                  <LookupSelect
                    lookupKey="salesEmployees"
                    periodId={periodId}
                    value={form.salesperson}
                    onChange={(v) => setForm({ ...form, salesperson: v })}
                  />
                </div>
              </label>
            </div>
          </section>

          {/* ─── Trip info ─── */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Trip Information
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input
                label="Booking Date"
                type="date"
                value={form.bookingDate}
                onChange={(v) => setForm({ ...form, bookingDate: v })}
              />
              <Input
                label="Trip Start"
                type="date"
                value={form.tripStart}
                onChange={(v) => setForm({ ...form, tripStart: v })}
              />
              <Input
                label="Due Date"
                type="date"
                value={form.dueDate}
                onChange={(v) => setForm({ ...form, dueDate: v })}
              />
              <Input
                label="Trip Dates (free text)"
                value={form.tripDates}
                onChange={(v) => setForm({ ...form, tripDates: v })}
              />
              <Input
                label="Destination"
                value={form.destination}
                onChange={(v) => setForm({ ...form, destination: v })}
              />
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">Status</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Open">Open</option>
                  <option value="Partial">Partial</option>
                  <option value="Settled">Settled</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </label>
            </div>
          </section>

          {/* ─── Adjustments ─── */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Adjustments
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Input
                label="Discounts (PKR)"
                type="number"
                value={form.discounts}
                onChange={(v) => setForm({ ...form, discounts: v })}
              />
              <Input
                label="Additional Charges (PKR)"
                type="number"
                value={form.additionalCharges}
                onChange={(v) => setForm({ ...form, additionalCharges: v })}
              />
              <Input
                label="Final Settlement (PKR)"
                type="number"
                value={form.finalSettlement}
                onChange={(v) => setForm({ ...form, finalSettlement: v })}
              />
              <div className="col-span-2 md:col-span-3">
                <Input
                  label="Receivable Notes"
                  value={form.receivableNotes}
                  onChange={(v) => setForm({ ...form, receivableNotes: v })}
                />
              </div>
            </div>
          </section>

          <p className="text-xs text-slate-600">
            Selecting a salesperson with a Total Package records the sale in
            the Sales Team page and adds commission (2.5%, or the Team Lead
            tiered rate).
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              {loading ? "Saving…" : adding ? "Create Client" : "Update"}
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

      <div className="flex justify-end">
        <button
          type="button"
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Client
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-500 text-sm">
          No clients yet. Click <strong>Add Client</strong> or post a Client
          Receipt in Transactions.
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
                    "Email / Contact",
                    "Salesperson",
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
                    <tr
                      key={r.id}
                      className="border-b border-slate-100 hover:bg-emerald-50/40"
                    >
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {editable ? (
                          <Link
                            href={href}
                            className="text-slate-900 hover:text-emerald-700"
                          >
                            {r.name}
                          </Link>
                        ) : (
                          r.name
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {r.phone || "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-600 max-w-[180px] truncate">
                        {r.email || r.contact || "-"}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {r.salesperson || "-"}
                      </td>
                      <td className="px-3 py-3 max-w-[180px] truncate">
                        {r.tripInfo}
                      </td>
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
                            r.status === "Settled" ||
                            r.status === "Completed"
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