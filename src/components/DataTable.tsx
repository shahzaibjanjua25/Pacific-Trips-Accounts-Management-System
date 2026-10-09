import { cn, formatPKR } from "@/lib/utils";

type Column<T> = {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  align?: "left" | "right" | "center";
  money?: boolean;
};

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  emptyMessage = "No records yet. Add the first entry.",
}: {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
}) {
  if (data.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-sm">
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    "px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    !col.align && "text-left"
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                className="border-b border-slate-100 hover:bg-slate-50/80 transition-colors"
              >
                {columns.map((col) => {
                  const raw = row[col.key];
                  let content: React.ReactNode = col.render
                    ? col.render(row)
                    : col.money && typeof raw === "number"
                    ? formatPKR(raw)
                    : String(raw ?? "—");
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        "px-4 py-2.5 whitespace-nowrap",
                        col.align === "right" && "text-right tabular-nums",
                        col.align === "center" && "text-center",
                        col.money && "text-right tabular-nums"
                      )}
                    >
                      {content}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
