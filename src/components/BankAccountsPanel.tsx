"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X, Check, Loader2 } from "lucide-react";
import { formatPKR } from "@/lib/utils";
import { useMutate } from "./useMutate";

export type BankRow = {
  id: string;
  accountName: string;
  balance: number;
  asOfDate?: string | Date | null;
};

type Props = {
  periodId: string;
  initialRows: BankRow[];
};

export function BankAccountsPanel({ periodId, initialRows }: Props) {
  const router = useRouter();
  const mutate = useMutate();
  const [rows, setRows] = useState<BankRow[]>(initialRows);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BankRow | null>(null);
  const [form, setForm] = useState({ accountName: "", balance: "0" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openAdd() {
    setEditing(null);
    setForm({ accountName: "", balance: "0" });
    setOpen(true);
    setError(null);
  }

  function openEdit(row: BankRow) {
    setEditing(row);
    setForm({
      accountName: row.accountName || "",
      balance: String(row.balance ?? 0),
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
      await mutate(editing ? "Updating account…" : "Creating account…", async () => {
        const payload = {
          accountName: form.accountName.trim(),
          balance: parseFloat(form.balance) || 0,
          periodId,
        };
        const res = await fetch("/api/bank", {
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
          setRows((prev) => [...prev, saved]);
        }
      });
      setOpen(false);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this bank account balance row?")) return;
    setLoading(true);
    setError(null);
    try {
      await mutate("Deleting account…", async () => {
        const res = await fetch(`/api/bank?id=${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        setRows((prev) => prev.filter((r) => r.id !== id));
      });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const total = rows.reduce((s, r) => s + (Number(r.balance) || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">Bank Accounts</h2>
          <p className="text-xs text-slate-500">
            Total: <strong className="tabular-nums">{formatPKR(total)}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          <Plus size={16} /> Add Account
        </button>
      </div>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">
              {editing ? "Edit Account" : "New Account"}
            </h3>
            <button type="button" onClick={() => setOpen(false)} className="p-1">
              <X size={16} />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Account Name</span>
              <input
                required
                value={form.accountName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountName: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2.5 py-1.5 text-sm bg-white"
                placeholder="e.g. Faysal Bank"
              />
            </label>
            <label className="block text-xs">
              <span className="font-medium text-slate-600">Balance (PKR)</span>
              <input
                type="number"
                required
                value={form.balance}
                onChange={(e) =>
                  setForm((f) => ({ ...f, balance: e.target.value }))
                }
                className="mt-1 w-full border border-amber-300 rounded-md px-2.5 py-1.5 text-sm bg-white"
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
        <div className="bg-white rounded-xl border p-10 text-center text-sm text-slate-500">
          No bank accounts yet. Click <strong>Add Account</strong> to create one.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase">
                    Account Name
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase">
                    Balance (PKR)
                  </th>
                  <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-600 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-2.5 font-medium">{r.accountName}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatPKR(Number(r.balance) || 0)}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        disabled={loading}
                        className="inline-flex items-center gap-1 px-2 py-1 text-sky-700 hover:bg-sky-50 rounded text-xs font-medium disabled:opacity-40"
                        title="Edit"
                      >
                        <Pencil size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(r.id)}
                        disabled={loading}
                        className="inline-flex items-center gap-1 px-2 py-1 text-red-700 hover:bg-red-50 rounded text-xs font-medium ml-1 disabled:opacity-40"
                        title="Delete"
                      >
                        <Trash2 size={14} /> Delete
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