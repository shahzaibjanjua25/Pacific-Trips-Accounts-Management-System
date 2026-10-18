"use client";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useMutate } from "./useMutate";

export function ComputePayrollButton({ periodId }: { periodId: string }) {
  const mutate = useMutate();
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      let count = 0;
      await mutate("Computing payroll…", async () => {
        const res = await fetch("/api/payroll/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ periodId }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        count = data.results?.length || 0;
      });
      alert(`Payroll computed for ${count} sales staff.`);
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
      className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      {loading && <Loader2 size={16} className="animate-spin" />}
      {loading ? "Computing…" : "Compute Sales Payroll (40k + 2.5%)"}
    </button>
  );
}