export default function WorkspaceLoading() {
  return (
    <div role="status" aria-label="Loading workspace" className="space-y-5 motion-safe:animate-pulse">
      <div className="h-40 rounded-3xl bg-slate-200/80" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 rounded-2xl border border-slate-200 bg-white" />
        ))}
      </div>
      <span className="sr-only">Loading workspace…</span>
    </div>
  );
}
