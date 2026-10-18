"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutate } from "./useMutate";

export function SyncAllPayrollButton({ periodId }: { periodId: string }) {
  const mutate = useMutate();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      let count = 0;
      await mutate("Syncing payroll…", async () => {
        const res = await fetch("/api/payroll/sync-all", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodId }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        count = data.count || 0;
      });
      alert(`Synced ${count} payroll rows.`);
    } catch (e) {
      alert("Sync failed: " + e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {loading ? "Syncing…" : "Sync Payroll (all Sales)"}
    </button>
  );
}