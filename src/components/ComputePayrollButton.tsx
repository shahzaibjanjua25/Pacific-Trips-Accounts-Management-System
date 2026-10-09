"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function ComputePayrollButton({ periodId }: { periodId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      alert(`Payroll computed for ${data.results?.length || 0} sales staff.`);
      router.refresh();
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
      className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      {loading ? "Computing…" : "Compute Sales Payroll (40k + 2.5%)"}
    </button>
  );
}
