"use client";

import { useEffect, useState } from "react";

type LookupItem = { value: string; label: string; meta?: string };

export function LookupSelect({
  lookupKey,
  periodId,
  value,
  onChange,
  required,
  className,
  allowOther = true,
}: {
  lookupKey: string;
  periodId?: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  allowOther?: boolean;
}) {
  const [items, setItems] = useState<LookupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOther, setShowOther] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = new URLSearchParams({ key: lookupKey });
    if (periodId) qs.set("periodId", periodId);
    fetch(`/api/lookup?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lookupKey, periodId]);

  // If the value isn't in the list, keep it as the current selection
  const hasValue = items.some((i) => i.value === value);
  const selectValue = showOther ? "__other__" : value;

  return (
    <div className="space-y-1">
      <select
        value={selectValue}
        onChange={(e) => {
          if (e.target.value === "__other__") {
            setShowOther(true);
            onChange("");
          } else {
            setShowOther(false);
            onChange(e.target.value);
          }
        }}
        required={required && !showOther}
        className={
          className ??
          "w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        }
        disabled={loading}
      >
        <option value="">
          {loading ? "Loading…" : "— Select —"}
        </option>
        {!hasValue && value && (
          <option value={value}>{value} (current)</option>
        )}
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
            {item.meta ? ` — ${item.meta}` : ""}
          </option>
        ))}
        {allowOther && <option value="__other__">Other…</option>}
      </select>

      {showOther && (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a name"
          required={required}
          className="w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
      )}
    </div>
  );
}