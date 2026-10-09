"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InitPayrollButton({ periodId }: { periodId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/payroll/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ periodId }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      alert(`Created ${data.created} payroll rows from employee roster.`);
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
      className="bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      {loading ? "Loading…" : "Load team into payroll"}
    </button>
  );
}
