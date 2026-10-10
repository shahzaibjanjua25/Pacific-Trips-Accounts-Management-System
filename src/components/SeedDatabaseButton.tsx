"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Database, RefreshCw, AlertTriangle } from "lucide-react";

type Counts = {
    periods: number;
    employees: number;
    clients: number;
    receivables: number;
    payables: number;
    payroll: number;
    bankBalances: number;
    assets: number;
    vadets: number;
    isEmpty: boolean;
};

export function SeedDatabaseButton() {
    const router = useRouter();
    const [counts, setCounts] = useState<Counts | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingCounts, setLoadingCounts] = useState(true);
    const [result, setResult] = useState<string | null>(null);

    async function refreshCounts() {
        setLoadingCounts(true);
        try {
            const res = await fetch("/api/admin/seed");
            const data = await res.json();
            if (res.ok) setCounts(data);
        } finally {
            setLoadingCounts(false);
        }
    }

    useEffect(() => {
        refreshCounts();
    }, []);

    async function runSeed(force: boolean) {
        const msg = force
            ? "⚠️ This will DELETE ALL existing data and reseed from the Excel workbook.\n\nType OK to confirm."
            : "Run seed? It will only work if the database is empty.";
        const typed = force ? prompt(msg) : "OK";
        if (force && typed !== "OK") return;

        setLoading(true);
        setResult(null);
        try {
            const res = await fetch("/api/admin/seed", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ force }),
            });
            const data = await res.json();
            if (!res.ok) {
                setResult(`❌ ${data.message || data.error}`);
                return;
            }
            setResult(
                `✅ ${data.message}\n` +
                Object.entries(data.counts || {})
                    .map(([k, v]) => `  • ${k}: ${v}`)
                    .join("\n")
            );
            await refreshCounts();
            router.refresh();
        } catch (e) {
            setResult(`❌ ${e}`);
        } finally {
            setLoading(false);
        }
    }

    const hasData = !!counts && !counts.isEmpty;   // or: Boolean(counts && !counts.isEmpty)

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-50 rounded-lg">
                        <Database size={20} className="text-emerald-700" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">Database Status</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Seed / restore the Pacific Trips workbook data.
                        </p>

                        {loadingCounts ? (
                            <p className="text-xs text-slate-400 mt-2">Checking…</p>
                        ) : counts ? (
                            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-600">
                                <span>Periods: <strong>{counts.periods}</strong></span>
                                <span>Employees: <strong>{counts.employees}</strong></span>
                                <span>Clients: <strong>{counts.clients}</strong></span>
                                <span>Receivables: <strong>{counts.receivables}</strong></span>
                                <span>Payables: <strong>{counts.payables}</strong></span>
                                <span>Payroll rows: <strong>{counts.payroll}</strong></span>
                                <span>Bank accts: <strong>{counts.bankBalances}</strong></span>
                                <span>Assets: <strong>{counts.assets}</strong></span>
                                <span>Vadets: <strong>{counts.vadets}</strong></span>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => runSeed(false)}
                        disabled={loading || hasData}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                        title={hasData ? "Database already has data" : "Seed empty database"}
                    >
                        {loading ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                        Seed (if empty)
                    </button>

                    <button
                        type="button"
                        onClick={() => runSeed(true)}
                        disabled={loading}
                        className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
                        title="Wipe everything and reseed"
                    >
                        <AlertTriangle size={14} />
                        Force Reseed
                    </button>
                </div>
            </div>

            {result && (
                <pre className="mt-3 text-xs whitespace-pre-wrap bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-700 font-mono">
                    {result}
                </pre>
            )}
        </div>
    );
}