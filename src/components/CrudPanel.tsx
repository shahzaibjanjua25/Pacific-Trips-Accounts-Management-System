"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPKR } from "@/lib/utils";
import { Pencil, Trash2, Plus, X, ChevronDown, ChevronRight } from "lucide-react";
import { LinkedTransactions } from "./LinkedTransactions";

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "select" | "textarea";
  options?: string[];
  required?: boolean;
  money?: boolean;
  showInTable?: boolean;
  /** show in the form only, not persisted (used for hotel cost etc.) */
  transient?: boolean;
};

type Row = Record<string, unknown> & { id: string };

export function CrudPanel({
  title,
  apiPath,
  periodId,
  fields,
  rows,
  extraPayload,
  /** Optional: show linked transactions under each row */
  linkedEntityType,
}: {
  title: string;
  apiPath: string;
  periodId: string;
  fields: FieldDef[];
  rows: Row[];
  extraPayload?: Record<string, unknown>;
  linkedEntityType?: string; // "payable" | "hotel" | "transport" | ...
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const tableFields = fields.filter((f) => f.showInTable !== false && !f.transient);

  function openAdd() {
    setEditing(null);
    const init: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.type === "date") init[f.key] = new Date().toISOString().slice(0, 10);
      else if (f.type === "number") init[f.key] = "0";
      else if (f.type === "select" && f.options?.[0]) init[f.key] = f.options[0];
      else init[f.key] = "";
    });
    setForm(init);
    setOpen(true);
  }

  function openEdit(row: Row) {
    setEditing(row);
    const init: Record<string, string> = {};
    fields.forEach((f) => {
      const v = row[f.key];
      if (f.type === "date" && v) {
        init[f.key] = new Date(v as string).toISOString().slice(0, 10);
      } else if (v == null) {
        init[f.key] = f.type === "number" ? "0" : "";
      } else {
        init[f.key] = String(v);
      }
    });
    setForm(init);
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: Record<string, unknown> = { periodId, ...extraPayload };
      fields.forEach((f) => {
        if (f.type === "number") payload[f.key] = parseFloat(form[f.key]) || 0;
        else payload[f.key] = form[f.key] || null;
      });

      if (editing) {
        payload.id = editing.id;
        const res = await fetch(apiPath, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      } else {
        const res = await fetch(apiPath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(await res.text());
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      alert("Save failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this record?")) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiPath}?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add
        </button>
      </div>

      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {editing ? "Edit Record" : "New Record"} (Yellow = Input)
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-slate-500"
            >
              <X size={18} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {fields.map((f) => (
              <label key={f.key} className="block text-xs">
                <span className="text-slate-600 font-medium">{f.label}</span>
                {f.type === "select" ? (
                  <select
                    value={form[f.key] || ""}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                    required={f.required}
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {(f.options || []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    value={form[f.key] || ""}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    rows={2}
                  />
                ) : (
                  <input
                    type={f.type || "text"}
                    value={form[f.key] || ""}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                    required={f.required}
                    className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </label>
            ))}
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
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
          No records yet. Click Add to create the first entry.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {linkedEntityType && (
                    <th className="w-8 px-2 py-2.5"></th>
                  )}
                  {tableFields.map((f) => (
                    <th
                      key={f.key}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wide whitespace-nowrap"
                    >
                      {f.label}
                    </th>
                  ))}
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isExpanded = expanded.has(row.id);
                  const payableId =
                    row.payableId ||
                    (row.payable as { id?: string } | undefined)?.id;
                  const linkId = linkedEntityType
                    ? linkedEntityType === "hotel" ||
                      linkedEntityType === "transport"
                      ? (payableId as string) || row.id
                      : row.id
                    : null;
                  const linkType =
                    linkedEntityType === "hotel" ||
                    linkedEntityType === "transport"
                      ? "payable"
                      : linkedEntityType;

                  return (
                    <>
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 hover:bg-slate-50/80"
                      >
                        {linkedEntityType && (
                          <td className="px-2 py-2">
                            <button
                              type="button"
                              onClick={() => toggleExpand(row.id)}
                              className="text-slate-400 hover:text-slate-700"
                            >
                              {isExpanded ? (
                                <ChevronDown size={14} />
                              ) : (
                                <ChevronRight size={14} />
                              )}
                            </button>
                          </td>
                        )}
                        {tableFields.map((f) => {
                          const v = row[f.key];
                          let display: React.ReactNode = "—";
                          if (v != null && v !== "") {
                            if (f.money && typeof v === "number")
                              display = formatPKR(v);
                            else if (f.type === "date")
                              display = new Date(v as string).toLocaleDateString(
                                "en-GB"
                              );
                            else display = String(v);
                          }
                          return (
                            <td
                              key={f.key}
                              className={`px-3 py-2 whitespace-nowrap ${
                                f.money ? "text-right tabular-nums" : ""
                              }`}
                            >
                              {display}
                            </td>
                          );
                        })}
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button
                            onClick={() => openEdit(row)}
                            className="inline-flex p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                            title="Edit"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => remove(row.id)}
                            className="inline-flex p-1.5 text-red-600 hover:bg-red-50 rounded ml-1"
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                      {isExpanded && linkId && linkType && (
                        <tr key={`${row.id}-exp`} className="bg-slate-50/50">
                          <td colSpan={tableFields.length + (linkedEntityType ? 2 : 1)} className="px-6 py-3">
                            <LinkedTransactions
                              entityType={linkType}
                              entityId={String(linkId)}
                              title="Payments linked to this record"
                            />
                          </td>
                        </tr>
                      )}
                    </>
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