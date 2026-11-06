"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export async function downloadMonthZip(periodId: string, periodLabel: string, forDeletion = false) {
  const query = new URLSearchParams({ periodId });
  if (forDeletion) query.set("forDeletion", "1");
  const res = await fetch("/api/export?" + query.toString());
  if (!res.ok) {
    const error = await res.json().catch(() => null);
    throw new Error(error?.error || "Could not prepare the ZIP.");
  }
  const blob = await res.blob();
  if (!blob.size || !res.headers.get("Content-Type")?.includes("application/zip")) {
    throw new Error("The server did not return a valid ZIP.");
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const label = periodLabel.replace(/\s+/g, "_");
  link.download = "Pacific_Trips_" + label + (forDeletion ? "_Backup.zip" : "_Export.zip");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return res.headers.get("X-Month-Backup-Proof");
}

export function ExportMonthButton({ periodId, periodLabel }: { periodId: string; periodLabel: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function download() {
    setLoading(true);
    setError("");
    try {
      await downloadMonthZip(periodId, periodLabel);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={download} disabled={loading}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:border-teal-400 hover:text-teal-800 disabled:opacity-50">
        <Download size={16} aria-hidden />
        {loading ? "Preparing ZIP…" : "Export Excel ZIP"}
      </button>
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
    </div>
  );
}
