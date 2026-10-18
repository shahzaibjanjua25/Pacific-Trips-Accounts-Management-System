"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X, Check, Loader2 } from "lucide-react";
import { formatPKR } from "@/lib/utils";
import { useMutate } from "./useMutate";

export type BankTxnRow = {
  id: string;
  periodId?: string;
  date: string | Date;
  accountName: string;
  description?: string | null;
  deposit: number;
  withdrawal: number;
  transferIn: number;
  transferOut: number;
  bankCharges?: number;
  balance: number;
  notes?: string | null;
};

type Props = {
  periodId: string;
  periodLabel: string;
  initialRows: BankTxnRow[];
  accounts: string[];
};

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  accountName: "",
  description: "",
  deposit: "0",
  withdrawal: "0",
  transferIn: "0",
  transferOut: "0",
  bankCharges: "0",
  balance: "0",
  notes: "",
};

export function BankMovementsPanel({
  periodId,
  periodLabel,
  initialRows,
  accounts,
}: Props) {
  const router = useRouter();
  const mutate = useMutate();
  const [rows, setRows] = useState<BankTxnRow[]>(initialRows);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankTxnRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setForm({
      ...emptyForm,
      date: new Date().toISOString().slice(0, 10),
      accountName: accounts[0] || "",
    });
    setOpen(true);
    setError(null);
  }

  function openEdit(row: BankTxnRow) {
    setEditing(row);
    const d = new Date(row.date);
    const dateStr = !isNaN(d.getTime())
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      : emptyForm.date;
    setForm({
      date: dateStr,
      accountName: row.accountName || "",
      description: row.description || "",
      deposit: String(row.deposit ?? 0),
      withdrawal: String(row.withdrawal ?? 0),
      transferIn: String(row.transferIn ?? 0),
      transferOut: String(row.transferOut ?? 0),
      bankCharges: String(row.bankCharges ?? 0),
      balance: String(row.balance ?? 0),
      notes: row.notes || "",
    });
    setOpen(true);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.accountName.trim()) {
      alert("Account name is required");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await mutate(
        editing ? "Updating bank movement…" : "Saving bank movement…",
        async () => {
          const payload = {
            periodId,
            date: form.date,
            accountName: form.accountName.trim(),
            description: form.description || null,
            deposit: parseFloat(form.deposit) || 0,
            withdrawal: parseFloat(form.withdrawal) || 0,
            transferIn: parseFloat(form.transferIn) || 0,
            transferOut: parseFloat(form.transferOut) || 0,
            bankCharges: parseFloat(form.bankCharges) || 0,
            balance: parseFloat(form.balance) || 0,
            notes: form.notes || null,
          };
          const res = await fetch("/api/bank-txn", {
            method: editing ? "PUT" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(
              editing ? { ...payload, id: editing.id } : payload
            ),
          });
          if (!res.ok) {
            const t = await res.text();
            throw new Error(t || `HTTP ${res.status}`);
          }
          const saved = await res.json();
          if (editing) {
            setRows((prev) =>
              prev.map((r) => (r.id === editing.id ? { ...r, ...saved } : r))
            );
          } else {
            setRows((prev) => [saved, ...prev]);
          }
        }
      );
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this bank movement record?")) return;
    setLoading(true);
    setError(null);
    try {
      await mutate("Deleting bank movement…", async () => {
        const res = await fetch(`/api/bank-txn?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        setRows((prev) => prev.filter((r) => r.id !== id));
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const accountOptions = Array.from(
    new Set([...accounts, ...rows.map((r) => r.accountName)].filter(Boolean))
  ).sort();

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-slate-50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h2 className="font-semibold text-slate-800">
            Bank movements — {periodLabel}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Edit or delete any row. Add manual entries if needed. Transfers from
            Transactions also appear here.
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 shrink-0 disabled:opacity-50"
        >
          <Plus size={16} /> Add Movement
        </button>
      </div>

      {error && (
        <div className="mx-4 mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {open && (
        <form
          onSubmit={save}
          className="m-4 bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">
              {editing ? "Edit Movement" : "New Movement"}
            </h3>
            <button type="button" onClick={() => setOpen(false)} className="p-1">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Date</span>
              <input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Account</span>
              <select
                required
                value={form.accountName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountName: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                <option value="">Select…</option>
                {accountOptions.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs md:col-span-2">
              <span className="font-medium text-slate-600">Description</span>
              <input
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Deposit</span>
              <input
                type="number"
                value={form.deposit}
                onChange={(e) =>
                  setForm((f) => ({ ...f, deposit: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Withdrawal</span>
              <input
                type="number"
                value={form.withdrawal}
                onChange={(e) =>
                  setForm((f) => ({ ...f, withdrawal: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Transfer In</span>
              <input
                type="number"
                value={form.transferIn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, transferIn: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Transfer Out</span>
              <input
                type="number"
                value={form.transferOut}
                onChange={(e) =>
                  setForm((f) => ({ ...f, transferOut: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Bank Charges</span>
              <input
                type="number"
                value={form.bankCharges}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bankCharges: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Balance after</span>
              <input
                type="number"
                value={form.balance}
                onChange={(e) =>
                  setForm((f) => ({ ...f, balance: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
            <label className="block text-xs md:col-span-2">
              <span className="font-medium text-slate-600">Notes</span>
              <input
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2 py-1.5 text-sm bg-white"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {loading ? "Saving…" : editing ? "Update" : "Save"}
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-500">
          No bank movements in this period yet. Click <strong>Add Movement</strong> or
          post a Completed transaction / Bank Transfer.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                {[
                  "Date",
                  "Account",
                  "Description",
                  "Deposit",
                  "Withdrawal",
                  "Transfer In",
                  "Transfer Out",
                  "Balance after",
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
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-b border-slate-100 hover:bg-slate-50/80"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {new Date(t.date).toLocaleDateString("en-GB")}
                  </td>
                  <td className="px-3 py-2">{t.accountName}</td>
                  <td className="px-3 py-2 max-w-[200px] truncate">
                    {t.description || "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {t.deposit ? formatPKR(t.deposit) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">
                    {t.withdrawal ? formatPKR(t.withdrawal) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                    {t.transferIn ? formatPKR(t.transferIn) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-red-700">
                    {t.transferOut ? formatPKR(t.transferOut) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatPKR(t.balance)}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      disabled={loading}
                      className="inline-flex items-center gap-1 px-2 py-1 text-sky-700 hover:bg-sky-50 rounded text-xs font-medium disabled:opacity-40"
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(t.id)}
                      disabled={loading}
                      className="inline-flex items-center gap-1 px-2 py-1 text-red-700 hover:bg-red-50 rounded text-xs font-medium ml-1 disabled:opacity-40"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}