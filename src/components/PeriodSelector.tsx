"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition } from "react";

type Period = {
  id: string;
  year: number;
  month: number;
  label: string;
  isClosed: boolean;
};

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

export function PeriodSelector({
  periods,
  currentId,
}: {
  periods: Period[];
  currentId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const now = new Date();
  const [newYear, setNewYear] = useState(now.getFullYear());
  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);

 function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
  const id = e.target.value;
  startTransition(() => {
    router.push(`${pathname}?period=${id}`);
  });
}

  async function createMonth() {
    const res = await fetch("/api/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ year: newYear, month: newMonth }),
    });
    if (!res.ok) {
      alert("Failed to create period");
      return;
    }
    const p = await res.json();
    setShowNew(false);
    if (p.carried) {
      alert(
        `Month ${p.label} created.\n\nCarried forward from previous month:\n` +
          `• Open receivables & payables\n` +
          `• Salaries (editable)\n` +
          `• Employee loans (installments applied: Ahsaan 30k, Amjad 20k, Awais 20k)\n` +
          `• Recurring office/marketing expenses\n` +
          `• Pending refunds & advances`
      );
    }
    startTransition(() => {
      router.push(`${pathname}?period=${p.id}`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-slate-600 font-medium whitespace-nowrap">Month:</label>
      <select
        value={currentId}
        onChange={onChange}
        disabled={isPending}
        className="border-2 border-emerald-500 rounded-md px-3 py-2 text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[140px]"
      >
        {periods.length === 0 && <option value="">No periods yet</option>}
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}{p.isClosed ? " (Closed)" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => setShowNew(!showNew)}
        className="text-xs bg-slate-800 text-white px-2.5 py-2 rounded-md hover:bg-slate-700"
      >
        + New Month
      </button>
      {isPending && <span className="text-xs text-slate-400">Loading…</span>}

      {showNew && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-2 py-1">
          <select
            value={newMonth}
            onChange={(e) => setNewMonth(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <input
            type="number"
            value={newYear}
            onChange={(e) => setNewYear(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm w-20"
          />
          <button
            type="button"
            onClick={createMonth}
            className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded"
          >
            Create (carry forward)
          </button>
        </div>
      )}
    </div>
  );
}
