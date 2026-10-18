"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutate } from "./useMutate";

export function InitPayrollButton({ periodId }: { periodId: string }) {
  const mutate = useMutate();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      let created = 0;
      await mutate("Loading team into payroll…", async () => {
        const res = await fetch("/api/payroll/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodId }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        created = data.created || 0;
      });
      alert(`Created ${created} payroll rows from employee roster.`);
    } catch (e) {
      alert("Failed: " + e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className="inline-flex items-center gap-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {loading ? "Loading…" : "Load team into payroll"}
    </button>
  );
}