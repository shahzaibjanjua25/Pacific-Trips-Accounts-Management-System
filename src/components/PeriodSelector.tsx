"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { useLoading } from "./LoadingProvider";
import { useMutate } from "./useMutate";

type Period = {
  id: string;
  year: number;
  month: number;
  label: string;
  isClosed: boolean;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function PeriodSelector({
  periods,
  currentId,
  allowCreate = false,
}: {
  periods: Period[];
  currentId: string;
  /** Only pass true on the Dashboard so new months are not created elsewhere */
  allowCreate?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const mutate = useMutate();
  const { begin, end } = useLoading();
  const [isPending, startTransition] = useTransition();
  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const now = new Date();
  const [newYear, setNewYear] = useState(now.getFullYear());
  const [newMonth, setNewMonth] = useState(now.getMonth() + 1);

  // Drive the global overlay while the month is switching
  useEffect(() => {
    if (isPending) begin("Loading month…");
    else end();
  }, [isPending, begin, end]);

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    startTransition(() => {
      router.push(`${pathname}?period=${id}`);
    });
  }

  async function createMonth() {
    setCreating(true);
    try {
      await mutate("Creating month…", async () => {
        const res = await fetch("/api/periods", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ year: newYear, month: newMonth }),
        });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text);
        }
        const p = await res.json();
        setShowNew(false);

        if (p.carried) {
          alert(
            `Month ${p.label} created.\n\n` +
              `Carried forward from previous month:\n` +
              `- Open receivables and payables\n` +
              `- Employee loans: monthly installment deducted from remaining ` +
              `(e.g. 185,000 - 20,000 = 165,000) until the loan is zero\n` +
              `- Payroll rows for the new month (editable)\n` +
              `- Recurring office / marketing templates\n` +
              `- Pending refunds and advances\n\n` +
              `This month is now available on every page via the Month dropdown.`
          );
        } else {
          alert(
            `Month ${p.label} is ready.\n` +
              `Select it from the Month dropdown on any page.`
          );
        }

        startTransition(() => {
          router.push(`${pathname}?period=${p.id}`);
        });
      });
    } catch (e) {
      alert("Failed to create period: " + e);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-sm text-slate-600 font-medium whitespace-nowrap">
        Month:
      </label>
      <select
        value={currentId}
        onChange={onChange}
        disabled={isPending}
        className="border-2 border-emerald-500 rounded-md px-3 py-2 text-sm bg-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 min-w-[140px]"
      >
        {periods.length === 0 && <option value="">No periods yet</option>}
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
            {p.isClosed ? " (Closed)" : ""}
          </option>
        ))}
      </select>

      {allowCreate && (
        <button
          type="button"
          onClick={() => setShowNew(!showNew)}
          disabled={isPending}
          className="text-xs bg-slate-800 text-white px-2.5 py-2 rounded-md hover:bg-slate-700 disabled:opacity-50"
        >
          + New Month
        </button>
      )}

      {allowCreate && showNew && (
        <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
          <select
            value={newMonth}
            onChange={(e) => setNewMonth(Number(e.target.value))}
            className="border rounded px-2 py-1 text-sm"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
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
            disabled={creating}
            className="bg-emerald-600 text-white text-xs px-3 py-1.5 rounded disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create (carry forward)"}
          </button>
        </div>
      )}
    </div>
  );
}