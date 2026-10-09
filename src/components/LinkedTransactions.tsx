"use client";

import { useEffect, useState } from "react";
import { formatPKR } from "@/lib/utils";
import { Receipt } from "lucide-react";

type Linked = {
  id: string;
  appliedAmount: number;
  createdAt: string;
  transaction: {
    id: string;
    date: string;
    description: string;
    category: string;
    party: string | null;
    debit: number;
    credit: number;
    bankAccount: string | null;
    paymentMethod: string | null;
    status: string;
  };
};

export function LinkedTransactions({
  entityType,
  entityId,
  title = "Payment History",
}: {
  entityType: string;
  entityId: string;
  title?: string;
}) {
  const [rows, setRows] = useState<Linked[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/linked-transactions?type=${entityType}&id=${entityId}`
        );
        const data = await res.json();
        if (!cancelled && Array.isArray(data)) setRows(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [entityType, entityId]);

  if (loading) {
    return (
      <div className="text-xs text-slate-400 py-2">Loading payments…</div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-xs text-slate-400 py-2 flex items-center gap-2">
        <Receipt size={12} /> No payments recorded yet.
      </div>
    );
  }

  const total = rows.reduce((s, r) => s + r.appliedAmount, 0);

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="bg-slate-50 px-3 py-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
          {title}
        </span>
        <span className="text-xs text-emerald-700 font-medium">
          Applied: {formatPKR(total)}
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[10px] text-slate-500 uppercase border-b">
            <th className="px-3 py-1.5">Date</th>
            <th className="px-3 py-1.5">Description</th>
            <th className="px-3 py-1.5">Account</th>
            <th className="px-3 py-1.5 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-slate-100">
              <td className="px-3 py-1.5 whitespace-nowrap">
                {new Date(r.transaction.date).toLocaleDateString("en-GB")}
              </td>
              <td className="px-3 py-1.5 max-w-[240px] truncate">
                {r.transaction.description}
              </td>
              <td className="px-3 py-1.5">
                {r.transaction.bankAccount || "—"}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                {formatPKR(r.appliedAmount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}