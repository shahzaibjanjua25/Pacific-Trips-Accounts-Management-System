"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  Plus,
  X,
  Check,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
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

export function BalanceSheetPanel({
  periodId,
  periodLabel,
  initialRows,
}: Props) {
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
  const [syncing, setSyncing] = useState(false);
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

  async function syncFromBooks() {
    if (
      !confirm(
        "Recompute the standard lines from live data?\n\nManually-added lines are kept untouched."
      )
    )
      return;
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/balance-sheet/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      const reload = await fetch(`/api/balance-sheet?periodId=${periodId}`);
      if (reload.ok) {
        const fresh = await reload.json();
        setRows(fresh);
      }
      router.refresh();
      alert(result.message ?? "Synced.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
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
  const workingCapital = assets - liabilities;
  const debtToEquity = equity > 0 ? liabilities / equity : 0;
  const currentRatio = liabilities > 0 ? assets / liabilities : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile label="Total Assets" value={assets} tone="sky" />
        <KpiTile label="Total Liabilities" value={liabilities} tone="rose" />
        <KpiTile label="Total Equity" value={equity} tone="violet" />
        <KpiTile
          label="Working Capital"
          value={workingCapital}
          tone={workingCapital >= 0 ? "emerald" : "red"}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">
            Balance Sheet — {periodLabel}
          </h2>
          <p className="text-xs text-slate-500">
            Edit, add, or delete any line. Figures are stored per month.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`text-sm font-medium px-3 py-1.5 rounded-lg border flex items-center gap-1.5 ${
              balanced
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-amber-50 border-amber-200 text-amber-900"
            }`}
          >
            {balanced ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {balanced ? "Balanced" : "Out of balance"}
            <span className="text-[11px] opacity-70 ml-1">
              ({formatPKR(assets)} vs {formatPKR(liabilities + equity)})
            </span>
          </div>
          <button
            type="button"
            onClick={syncFromBooks}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            <RefreshCw size={14} className={syncing ? "animate-spin" : ""} />
            {syncing ? "Syncing…" : "Sync from books"}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          section="Asset"
          title="Assets"
          rows={bySection("Asset")}
          total={assets}
          editingId={editingId}
          draft={draft}
          setDraft={setDraft}
          startEdit={startEdit}
          cancelEdit={cancelEdit}
          saveEdit={saveEdit}
          remove={remove}
          loading={loading}
          addingSection={addingSection}
          setAddingSection={setAddingSection}
          newRow={newRow}
          setNewRow={setNewRow}
          addLine={addLine}
          color="sky"
        />

        <div className="space-y-4">
          <SectionCard
            section="Liability"
            title="Liabilities"
            rows={bySection("Liability")}
            total={liabilities}
            editingId={editingId}
            draft={draft}
            setDraft={setDraft}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
            remove={remove}
            loading={loading}
            addingSection={addingSection}
            setAddingSection={setAddingSection}
            newRow={newRow}
            setNewRow={setNewRow}
            addLine={addLine}
            color="rose"
          />
          <SectionCard
            section="Equity"
            title="Equity"
            rows={bySection("Equity")}
            total={equity}
            editingId={editingId}
            draft={draft}
            setDraft={setDraft}
            startEdit={startEdit}
            cancelEdit={cancelEdit}
            saveEdit={saveEdit}
            remove={remove}
            loading={loading}
            addingSection={addingSection}
            setAddingSection={setAddingSection}
            newRow={newRow}
            setNewRow={setNewRow}
            addLine={addLine}
            color="violet"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-3">
          Financial Ratios
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <RatioTile
            label="Current Ratio"
            value={currentRatio.toFixed(2)}
            good={currentRatio >= 1.5}
            hint="Assets ÷ Liabilities (want > 1.5)"
          />
          <RatioTile
            label="Debt-to-Equity"
            value={debtToEquity.toFixed(2)}
            good={debtToEquity < 1}
            hint="Liabilities ÷ Equity (want < 1.0)"
          />
          <RatioTile
            label="Working Capital"
            value={formatPKR(workingCapital)}
            good={workingCapital >= 0}
            hint="Assets − Liabilities (want > 0)"
          />
          <RatioTile
            label="Balance Check"
            value={balanced ? "Balanced" : formatPKR(assets - liabilities - equity)}
            good={balanced}
            hint="Assets − (Liabilities + Equity)"
          />
        </div>
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "rose" | "violet" | "emerald" | "red";
}) {
  const map = {
    sky: "border-sky-200 bg-sky-50 text-sky-900",
    rose: "border-rose-200 bg-rose-50 text-rose-900",
    violet: "border-violet-200 bg-violet-50 text-violet-900",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-900",
    red: "border-red-200 bg-red-50 text-red-900",
  }[tone];
  return (
    <div className={`rounded-xl border p-4 ${map}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
        {label}
      </p>
      <p className="text-xl font-bold tabular-nums mt-1">{formatPKR(value)}</p>
    </div>
  );
}

function RatioTile({
  label,
  value,
  good,
  hint,
}: {
  label: string;
  value: string;
  good: boolean;
  hint: string;
}) {
  return (
    <div className="border rounded-lg p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        {good ? (
          <TrendingUp size={14} className="text-emerald-600" />
        ) : (
          <TrendingDown size={14} className="text-red-600" />
        )}
      </div>
      <p
        className={`text-lg font-bold tabular-nums mt-1 ${
          good ? "text-emerald-700" : "text-red-700"
        }`}
      >
        {value}
      </p>
      <p className="text-[10px] text-slate-400 mt-0.5">{hint}</p>
    </div>
  );
}

function SectionCard({
  section,
  title,
  rows,
  total,
  editingId,
  draft,
  setDraft,
  startEdit,
  cancelEdit,
  saveEdit,
  remove,
  loading,
  addingSection,
  setAddingSection,
  newRow,
  setNewRow,
  addLine,
  color,
}: {
  section: string;
  title: string;
  rows: BSLine[];
  total: number;
  editingId: string | null;
  draft: { label: string; amount: string; section: string; notes: string };
  setDraft: (v: { label: string; amount: string; section: string; notes: string }) => void;
  startEdit: (r: BSLine) => void;
  cancelEdit: () => void;
  saveEdit: (id: string) => void;
  remove: (id: string) => void;
  loading: boolean;
  addingSection: string | null;
  setAddingSection: (s: string | null) => void;
  newRow: { label: string; amount: string; notes: string };
  setNewRow: (v: { label: string; amount: string; notes: string }) => void;
  addLine: (section: string) => void;
  color: "sky" | "rose" | "violet";
}) {
  const headerColor = {
    sky: "bg-sky-50 text-sky-900",
    rose: "bg-rose-50 text-rose-900",
    violet: "bg-violet-50 text-violet-900",
  }[color];

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden flex flex-col">
      <div className={`px-4 py-3 border-b font-semibold text-sm ${headerColor}`}>
        {title}
      </div>
      <div className="divide-y flex-1">
        {rows.length === 0 && (
          <p className="px-4 py-6 text-center text-xs text-slate-400">
            No lines yet
          </p>
        )}
        {rows.map((r) =>
          editingId === r.id ? (
            <div key={r.id} className="px-3 py-2 space-y-2 bg-amber-50/50">
              <input
                className="w-full border rounded-md px-2 py-1 text-sm"
                value={draft.label}
                onChange={(e) =>
                  setDraft({ ...draft, label: e.target.value })
                }
                placeholder="Label"
              />
              <input
                type="number"
                className="w-full border rounded-md px-2 py-1 text-sm"
                value={draft.amount}
                onChange={(e) =>
                  setDraft({ ...draft, amount: e.target.value })
                }
                placeholder="Amount"
              />
              <select
                className="w-full border rounded-md px-2 py-1 text-sm"
                value={draft.section}
                onChange={(e) =>
                  setDraft({ ...draft, section: e.target.value })
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
          <span className="tabular-nums">{formatPKR(total)}</span>
        </div>
        {addingSection === section ? (
          <div className="space-y-2">
            <input
              className="w-full border rounded-md px-2 py-1 text-sm"
              placeholder="New line label"
              value={newRow.label}
              onChange={(e) =>
                setNewRow({ ...newRow, label: e.target.value })
              }
            />
            <input
              type="number"
              className="w-full border rounded-md px-2 py-1 text-sm"
              placeholder="Amount (PKR)"
              value={newRow.amount}
              onChange={(e) =>
                setNewRow({ ...newRow, amount: e.target.value })
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
}