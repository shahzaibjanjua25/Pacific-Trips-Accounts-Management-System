"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function ExportMonthButton({
  periodId,
  periodLabel,
}: {
  periodId: string;
  periodLabel: string;
}) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const res = await fetch(`/api/export?periodId=${periodId}`);
      if (!res.ok) throw new Error(await res.text());
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Pacific_Trips_${periodLabel.replace(/\s+/g, "_")}_Export.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert("Export failed: " + e);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={loading}
      className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
    >
      <Download size={16} />
      {loading ? "Preparing ZIP…" : `Download 3 Excel files (${periodLabel})`}
    </button>
  );
}
