"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X, Check } from "lucide-react";
import { formatPKR } from "@/lib/utils";

export type BSLine = {
  id: string;
  periodId: string;
  section: string;
  label: string;
  amount: number;
  sortOrder: number;
  notes?: string | null;
};

const SECTIONS = ["Asset", "Liability", "Equity"] as const;

type Props = {
  periodId: string;
  periodLabel: string;
  initialRows: BSLine[];
};

export function BalanceSheetPanel({ periodId, periodLabel, initialRows }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<BSLine[]>(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    label: "",
    amount: "",
    section: "Asset",
    notes: "",
  });
  const [addingSection, setAddingSection] = useState<string | null>(null);
  const [newRow, setNewRow] = useState({ label: "", amount: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEdit(r: BSLine) {
    setEditingId(r.id);
    setDraft({
      label: r.label,
      amount: String(r.amount),
      section: r.section,
      notes: r.notes || "",
    });
    setAddingSection(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setAddingSection(null);
  }

  async function saveEdit(id: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/balance-sheet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          label: draft.label.trim(),
          amount: parseFloat(draft.amount) || 0,
          section: draft.section,
          notes: draft.notes || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
      setEditingId(null);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this balance sheet line?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/balance-sheet?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      setRows((prev) => prev.filter((r) => r.id !== id));
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function addLine(section: string) {
    if (!newRow.label.trim()) {
      alert("Label is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/balance-sheet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          periodId,
          section,
          label: newRow.label.trim(),
          amount: parseFloat(newRow.amount) || 0,
          notes: newRow.notes || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setRows((prev) => [...prev, created]);
      setNewRow({ label: "", amount: "", notes: "" });
      setAddingSection(null);
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  const bySection = (s: string) =>
    rows
      .filter((r) => r.section === s)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));

  const total = (s: string) =>
    bySection(s).reduce((sum, r) => sum + (r.amount || 0), 0);

  const assets = total("Asset");
  const liabilities = total("Liability");
  const equity = total("Equity");
  const balanced = Math.abs(assets - (liabilities + equity)) < 0.5;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Balance Sheet — {periodLabel}
          </h2>
          <p className="text-xs text-slate-500">
            Edit, add, or delete any line. Figures are stored per month.
          </p>
        </div>
        <div
          className={`text-sm font-medium px-3 py-1.5 rounded-lg border ${
            balanced
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-amber-50 border-amber-200 text-amber-900"
          }`}
        >
          Assets {formatPKR(assets)} · L+E {formatPKR(liabilities + equity)}
          {balanced ? " · Balanced" : " · Out of balance"}
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {SECTIONS.map((section) => {
          const list = bySection(section);
          const sum = total(section);
          return (
            <div
              key={section}
              className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col"
            >
              <div
                className={`px-4 py-3 border-b font-semibold text-sm ${
                  section === "Asset"
                    ? "bg-sky-50 text-sky-900"
                    : section === "Liability"
                      ? "bg-rose-50 text-rose-900"
                      : "bg-violet-50 text-violet-900"
                }`}
              >
                {section === "Asset"
                  ? "Assets"
                  : section === "Liability"
                    ? "Liabilities"
                    : "Equity"}
              </div>

              <div className="divide-y flex-1">
                {list.length === 0 && (
                  <p className="px-4 py-6 text-center text-xs text-slate-400">
                    No lines yet
                  </p>
                )}
                {list.map((r) =>
                  editingId === r.id ? (
                    <div key={r.id} className="px-3 py-2 space-y-2 bg-amber-50/50">
                      <input
                        className="w-full border rounded-md px-2 py-1 text-sm"
                        value={draft.label}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, label: e.target.value }))
                        }
                        placeholder="Label"
                      />
                      <input
                        type="number"
                        className="w-full border rounded-md px-2 py-1 text-sm"
                        value={draft.amount}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, amount: e.target.value }))
                        }
                        placeholder="Amount"
                      />
                      <select
                        className="w-full border rounded-md px-2 py-1 text-sm"
                        value={draft.section}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, section: e.target.value }))
                        }
                      >
                        {SECTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => saveEdit(r.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs"
                        >
                          <Check size={14} /> Save
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs"
                        >
                          <X size={14} /> Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      key={r.id}
                      className="px-3 py-2 flex items-start justify-between gap-2 hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">
                          {r.label}
                        </div>
                        <div className="text-sm tabular-nums text-slate-700">
                          {formatPKR(r.amount)}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(r.id)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                )}
              </div>

              <div className="border-t px-3 py-2 bg-slate-50">
                <div className="flex justify-between text-sm font-semibold mb-2">
                  <span>Total {section}</span>
                  <span className="tabular-nums">{formatPKR(sum)}</span>
                </div>

                {addingSection === section ? (
                  <div className="space-y-2">
                    <input
                      className="w-full border rounded-md px-2 py-1 text-sm"
                      placeholder="New line label"
                      value={newRow.label}
                      onChange={(e) =>
                        setNewRow((n) => ({ ...n, label: e.target.value }))
                      }
                    />
                    <input
                      type="number"
                      className="w-full border rounded-md px-2 py-1 text-sm"
                      placeholder="Amount (PKR)"
                      value={newRow.amount}
                      onChange={(e) =>
                        setNewRow((n) => ({ ...n, amount: e.target.value }))
                      }
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => addLine(section)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-600 text-white text-xs"
                      >
                        <Plus size={14} /> Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddingSection(null)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border text-xs"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setAddingSection(section);
                      setEditingId(null);
                      setNewRow({ label: "", amount: "", notes: "" });
                    }}
                    className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-dashed text-xs text-slate-600 hover:bg-white"
                  >
                    <Plus size={14} /> Add {section} line
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl border p-4 text-sm grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <div className="text-slate-500 text-xs uppercase">Total Assets</div>
          <div className="text-xl font-bold tabular-nums text-sky-800">
            {formatPKR(assets)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs uppercase">
            Total Liabilities
          </div>
          <div className="text-xl font-bold tabular-nums text-rose-800">
            {formatPKR(liabilities)}
          </div>
        </div>
        <div>
          <div className="text-slate-500 text-xs uppercase">Total Equity</div>
          <div className="text-xl font-bold tabular-nums text-violet-800">
            {formatPKR(equity)}
          </div>
        </div>
      </div>
    </div>
  );
}
