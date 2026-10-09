"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

type Period = {
  id: string;
  year: number;
  month: number;
  label: string;
  isClosed: boolean;
};

export function PeriodSelector({
  periods,
  currentId,
}: {
  periods: Period[];
  currentId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const id = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", id);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-slate-600 font-medium">Period:</label>
      <select
        value={currentId}
        onChange={onChange}
        disabled={isPending}
        className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {periods.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label} {p.isClosed ? "(Closed)" : ""}
          </option>
        ))}
      </select>
      {isPending && <span className="text-xs text-slate-400">Loading…</span>}
    </div>
  );
}
