"use client";

import { Loader2 } from "lucide-react";
import { useLoading } from "./LoadingProvider";

export function LoadingOverlay() {
  const { isLoading, label } = useLoading();

  if (!isLoading) return null;

  return (
    <>
      {/* Top progress bar — always visible */}
      <div className="fixed inset-x-0 top-0 z-[60] h-1 bg-emerald-100 overflow-hidden pointer-events-none">
        <div
          className="h-full w-1/3 bg-emerald-600"
          style={{ animation: "loading-bar 1.1s ease-in-out infinite" }}
        />
      </div>

      {/* Blocking overlay — prevents double-clicks and signals "wait" */}
      <div
        className="fixed inset-0 z-[55] bg-slate-900/20 backdrop-blur-[1px] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        aria-live="polite"
        aria-busy="true"
      >
        <div className="bg-white rounded-xl shadow-2xl border border-slate-200 px-6 py-4 flex items-center gap-3 max-w-sm">
          <Loader2 className="h-5 w-5 text-emerald-600 animate-spin shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">
              {label || "Working…"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Please wait, don&apos;t click again.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </>
  );
}