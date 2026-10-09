"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncAllPayrollButton({ periodId }: { periodId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/sync-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      alert(`Synced ${data.count} payroll rows.`);
      router.refresh();
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
      className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      {loading ? "Syncing…" : "Sync Payroll (all Sales)"}
    </button>
  );
}