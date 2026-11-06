"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { CalendarDays, Download, Lock, Plus, Trash2 } from "lucide-react";
import { downloadMonthZip } from "./ExportMonthButton";

type Period = {
  id: string;
  year: number;
  month: number;
  label: string;
  isClosed: boolean;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const field = "min-h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-teal-600";
const secondary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:border-teal-400 hover:text-teal-800 disabled:opacity-50";
const primary = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-50";

function defaultMonth() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi", year: "numeric", month: "numeric",
  }).formatToParts(new Date());
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
  };
}

export function PeriodSelector({
  periods, currentId, allowCreate = false, allowClose = false, closeAvailable = false,
}: {
  periods: Period[];
  currentId: string;
  allowCreate?: boolean;
  allowClose?: boolean;
  closeAvailable?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const fieldId = useId();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<"create" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [date, setDate] = useState(defaultMonth);
  const [carryForward, setCarryForward] = useState(false);
  const [backup, setBackup] = useState<{ id: string; proof: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const selected = periods.find((period) => period.id === currentId);
  const previous = periods.find((period) =>
    period.year * 12 + period.month === date.year * 12 + date.month - 1
  );
  const disabled = pending || busy;

  function reset(next: typeof panel) {
    setPanel(next);
    setBackup(null);
    setSaved(false);
    setError("");
    setNotice("");
  }

  function navigate(id: string) {
    const params = new URLSearchParams(search.toString());
    if (id) params.set("period", id);
    else params.delete("period");
    const query = params.toString();
    startTransition(() => {
      router.replace(query ? pathname + "?" + query : pathname);
      router.refresh();
    });
  }

  async function perform(action: () => Promise<void>) {
    if (disabled) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function request(method: "POST" | "PATCH" | "DELETE", body: object) {
    const response = await fetch("/api/periods", {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "The month could not be updated.");
    return result;
  }

  function prepareBackup(period: Period) {
    setBackup(null);
    setSaved(false);
    void perform(async () => {
      const proof = await downloadMonthZip(period.id, period.label, true);
      if (!proof) throw new Error("The backup could not be verified. Download it again.");
      setBackup({ id: period.id, proof });
    });
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {periods.length > 0 && (
          <>
            <label htmlFor={fieldId} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
              <CalendarDays size={16} aria-hidden /> Accounting month
            </label>
            <select
              id={fieldId}
              value={currentId}
              onChange={(event) => { reset(null); navigate(event.target.value); }}
              disabled={disabled}
              className={field}
            >
              {periods.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}{period.isClosed ? " · Closed" : ""}
                </option>
              ))}
            </select>
          </>
        )}
        {allowCreate && (
          <button type="button" className={primary} disabled={disabled}
            aria-expanded={panel === "create"} onClick={() => reset(panel === "create" ? null : "create")}>
            <Plus size={16} aria-hidden /> New month
          </button>
        )}
        {allowCreate && selected && (
          <button type="button" className={secondary} disabled={disabled}
            aria-expanded={panel === "delete"} onClick={() => {
              if (panel === "delete") reset(null);
              else {
                reset("delete");
                prepareBackup(selected);
              }
            }}>
            <Trash2 size={15} aria-hidden /> Remove month
          </button>
        )}
        {allowClose && selected && !selected.isClosed && (
          <button type="button" className={secondary} disabled={disabled || !closeAvailable}
            onClick={() => void perform(async () => {
              await request("PATCH", { id: selected.id });
              setNotice(selected.label + " marked closed.");
              router.refresh();
            })}>
            <Lock size={15} aria-hidden /> Mark month closed
          </button>
        )}
      </div>
      {allowClose && selected && !selected.isClosed && !closeAvailable && (
        <p className="text-xs text-slate-600">Closing becomes available after this month ends in Pakistan time.</p>
      )}
      {panel === "create" && (
        <form className="space-y-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-4 text-sm text-slate-700"
          onSubmit={(event) => {
            event.preventDefault();
            void perform(async () => {
              const period = await request("POST", { ...date, carryForward });
              reset(null);
              setNotice(period.label + (period.carried ? " opened with carry-forward." : " is ready."));
              navigate(period.id);
            });
          }}>
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1">Month
              <select value={date.month} className={field} disabled={disabled}
                onChange={(event) => { setCarryForward(false); setDate({ ...date, month: Number(event.target.value) }); }}>
                {MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}
              </select>
            </label>
            <label className="grid gap-1">Year
              <input type="number" min={1900} max={9999} required value={date.year || ""} className={field + " w-28"}
                disabled={disabled} onChange={(event) => { setCarryForward(false); setDate({ ...date, year: Number(event.target.value) }); }} />
            </label>
          </div>
          <label className="flex items-center gap-2 font-medium">
            <input type="checkbox" checked={carryForward} disabled={disabled || !previous?.isClosed}
              onChange={(event) => setCarryForward(event.target.checked)} />
            Carry forward from the previous month
          </label>
          <p className="text-xs leading-5 text-slate-600">
            {previous?.isClosed
              ? "Copies eligible open balances and recurring items and applies the existing loan carry-forward rules."
              : "Carry-forward is available once the previous calendar month has been closed."}
          </p>
          <button type="submit" className={primary} disabled={disabled}>{busy ? "Opening…" : "Open month"}</button>
        </form>
      )}
      {panel === "delete" && selected && (
        <section className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-slate-700">
          <h3 className="font-semibold text-red-950">Remove {selected.label}</h3>
          <p className="max-w-xl leading-6">
            This permanently removes the selected month’s records. Other months and shared bank balances stay in place.
            Save the ZIP first. It contains the three Excel workbooks and the month records as JSON.
          </p>
          <button type="button" className={secondary} disabled={disabled} onClick={() => prepareBackup(selected)}>
            <Download size={16} aria-hidden /> {busy && !backup ? "Preparing ZIP…" : "Download backup ZIP"}
          </button>
          {backup?.id === selected.id && (
            <div className="space-y-3">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={saved} disabled={disabled} onChange={(event) => setSaved(event.target.checked)} />
                I saved the backup ZIP.
              </label>
              <button type="button" disabled={disabled || !saved}
                className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-50"
                onClick={() => void perform(async () => {
                  await request("DELETE", { id: selected.id, proof: backup.proof });
                  reset(null);
                  setNotice(selected.label + " removed.");
                  navigate(periods.find((period) => period.id !== selected.id)?.id ?? "");
                })}>
                <Trash2 size={16} aria-hidden /> {busy ? "Removing…" : "Permanently remove month"}
              </button>
            </div>
          )}
        </section>
      )}
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
      {notice && <p role="status" className="text-sm text-teal-800">{notice}</p>}
    </div>
  );
}
