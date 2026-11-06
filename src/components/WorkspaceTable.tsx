"use client";

import {
  Children, Fragment, cloneElement, isValidElement, useId, useRef, useState,
  type ReactElement, type ReactNode, type TableHTMLAttributes,
} from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, ChevronLeft, ChevronRight, RotateCcw, Search } from "lucide-react";

type ElementProps = {
  children?: ReactNode;
  hidden?: boolean;
  colSpan?: number;
  value?: unknown;
  defaultValue?: unknown;
  "data-table-value"?: string | number;
};
type TableElement = ReactElement<ElementProps>;
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
const minWidth = 64;
const maxWidth = 1000;

function elements(children: ReactNode): TableElement[] {
  return Children.toArray(children).filter(isValidElement) as TableElement[];
}

function text(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  return Children.toArray(node).map((child) => {
    if (!isValidElement<ElementProps>(child)) return String(child);
    const value = child.props["data-table-value"] ?? child.props.value ?? child.props.defaultValue;
    if (typeof value === "string" || typeof value === "number") return String(value);
    return text(child.props.children);
  }).filter(Boolean).join(" ").trim();
}

function sortableNumber(value: string) {
  const date = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (date) return Date.UTC(Number(date[3]), Number(date[2]) - 1, Number(date[1]));
  if (/^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value)) return Date.parse(value);
  const amount = value.replace(/^\((.+)\)$/, "-$1").replace(/PKR|Rs\.?|₨|,|\s|%/gi, "");
  return /^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(amount) ? Number(amount) : NaN;
}

function compare(a: string, b: string) {
  const first = sortableNumber(a);
  const second = sortableNumber(b);
  if (Number.isFinite(first) && Number.isFinite(second)) return first - second;
  return collator.compare(a, b);
}

function primaryRow(element: TableElement): TableElement | undefined {
  return element.type === Fragment ? elements(element.props.children).find((child) => child.type === "tr") : element;
}

function rowVisibility(element: TableElement, hidden: boolean): TableElement {
  if (element.type === Fragment) {
    return cloneElement(element, {}, elements(element.props.children).map((child) => rowVisibility(child, hidden)));
  }
  return cloneElement(element, { hidden: hidden || element.props.hidden });
}

export function WorkspaceTable({
  children, className, ...tableProps
}: TableHTMLAttributes<HTMLTableElement>) {
  const id = useId();
  const table = useRef<HTMLTableElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const drag = useRef<{ column: number; x: number; widths: number[] } | null>(null);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [filterColumn, setFilterColumn] = useState("all");
  const [sort, setSort] = useState<{ column: number; ascending: boolean } | null>(null);
  const [widths, setWidths] = useState<number[]>([]);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(15);
  const sections = elements(children);
  const head = sections.find((section) => section.type === "thead");
  const body = sections.find((section) => section.type === "tbody");
  const header = elements(head?.props.children)[0];
  const columns = elements(header?.props.children).map((cell) => {
    const label = text(cell.props.children);
    return { cell, label, sortable: !!label && !/^actions?$/i.test(label) };
  });
  const rows = elements(body?.props.children).map((element) => {
    const cells = elements(primaryRow(element)?.props.children);
    return {
      element,
      values: cells.map((cell) => text(cell.props["data-table-value"] ?? cell.props.children)),
      placeholder: cells.length === 1 && (cells[0].props.colSpan ?? 1) > 1,
    };
  });
  const records = rows.filter((row) => !row.placeholder);
  const activeFilters = Object.entries(filters).filter(([, value]) => value.trim());
  const matching = records.filter(({ values }) => {
    return activeFilters.every(([column, filter]) => {
      const needle = filter.trim().toLocaleLowerCase();
      const haystack = column === "all" ? values : [values[Number(column)] ?? ""];
      return haystack.some((value) => value.toLocaleLowerCase().includes(needle));
    });
  });
  if (sort) {
    matching.sort((a, b) => {
      const first = a.values[sort.column] ?? "";
      const second = b.values[sort.column] ?? "";
      if (!first || /^[-—–]$/.test(first)) return !second || /^[-—–]$/.test(second) ? 0 : 1;
      if (!second || /^[-—–]$/.test(second)) return -1;
      return compare(first, second) * (sort.ascending ? 1 : -1);
    });
  }
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize));
  const visiblePage = Math.min(page, pageCount - 1);
  const first = visiblePage * pageSize;
  const visible = new Set(matching.slice(first, first + pageSize));
  const matched = new Set(matching);
  const displayOrder = [...matching, ...records.filter((row) => !matched.has(row))];
  const measuredWidths = () => widths.length ? widths : Array.from(table.current?.tHead?.rows[0]?.cells ?? [],
    (cell) => Math.round(cell.getBoundingClientRect().width));
  const isResized = widths.length === columns.length && widths.length > 0;
  const tableWidth = widths.reduce((sum, width) => sum + width, 0);

  function resize(column: number, start: number[], delta: number) {
    if (!start.length) return;
    setWidths(start.map((width, index) => index === column
      ? Math.min(maxWidth, Math.max(minWidth, width + delta))
      : width));
  }

  function movePage(next: number) {
    setPage(next);
    if (scroll.current) scroll.current.scrollTop = 0;
  }

  return (
    <div className="workspace-table">
      <div className="workspace-table-toolbar">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <label className="workspace-table-search">
            <Search size={15} aria-hidden />
            <span className="sr-only">Filter rows</span>
            <input value={filters[filterColumn] ?? ""} placeholder="Filter rows…" onChange={(event) => {
              setFilters((current) => ({ ...current, [filterColumn]: event.target.value }));
              movePage(0);
            }} />
          </label>
          <select aria-label="Filter column" value={filterColumn} onChange={(event) => {
            setFilterColumn(event.target.value); movePage(0);
          }}>
            <option value="all">All columns</option>
            {columns.map(({ label, sortable }, index) =>
              sortable && <option key={index} value={index}>{label}</option>
            )}
          </select>
          {(activeFilters.length > 0 || sort || isResized) && (
            <button type="button" className="workspace-table-button" onClick={() => {
              setFilters({}); setFilterColumn("all"); setSort(null); setWidths([]); movePage(0);
            }}><RotateCcw size={14} aria-hidden /> Reset view</button>
          )}
        </div>
        <label className="workspace-table-size">
          <span>Rows</span>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); movePage(0); }}>
            {[10, 15, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      {activeFilters.length > 0 && (
        <div className="flex flex-wrap gap-2 border-b border-emerald-100 bg-white px-3 py-2 text-xs">
          {activeFilters.map(([column, value]) => {
            const label = column === "all" ? "All columns" : columns[Number(column)]?.label ?? "Column";
            return (
              <button type="button" key={column} aria-label={"Clear " + label + " filter"}
                className="max-w-full break-all rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-800 hover:bg-emerald-100"
                onClick={() => {
                  setFilters((current) => ({ ...current, [column]: "" })); movePage(0);
                }}>
                {label}: {value} ×
              </button>
            );
          })}
        </div>
      )}
      <div ref={scroll} className="workspace-table-scroll" tabIndex={0} role="region" aria-label="Scrollable table">
        <table {...tableProps} ref={table} id={id} className={className} data-resized={isResized || undefined}
          style={isResized ? { ...tableProps.style, width: tableWidth, tableLayout: "fixed" } : tableProps.style}>
          {isResized && <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>}
          {head && header && cloneElement(head, {}, cloneElement(header, {}, columns.map(({ cell, label, sortable }, index) => {
            const direction = sort?.column === index ? (sort.ascending ? "ascending" : "descending") : undefined;
            const Icon = direction === "ascending" ? ArrowUp : direction === "descending" ? ArrowDown : ArrowDownUp;
            return cloneElement(cell as ReactElement<ElementProps & { "aria-sort"?: "ascending" | "descending"; scope?: "col" }>,
              { scope: "col", "aria-sort": direction }, (
                <>
                  {sortable ? (
                    <button type="button" className="workspace-table-sort"
                      aria-label={"Sort by " + label} onClick={() => {
                        setSort({ column: index, ascending: direction !== "ascending" }); movePage(0);
                      }}>
                      <span>{cell.props.children}</span><Icon size={13} aria-hidden />
                    </button>
                  ) : cell.props.children}
                  <button type="button" className="workspace-table-resize"
                    aria-label={"Resize " + (label || "column " + (index + 1))}
                    title="Drag to resize, or use Left and Right arrow keys"
                    onPointerDown={(event) => {
                      if (event.button !== 0) return;
                      event.preventDefault();
                      event.currentTarget.focus();
                      drag.current = { column: index, x: event.clientX, widths: measuredWidths() };
                      event.currentTarget.setPointerCapture(event.pointerId);
                    }}
                    onPointerMove={(event) => {
                      const active = drag.current;
                      if (active?.column === index) resize(index, active.widths, event.clientX - active.x);
                    }}
                    onLostPointerCapture={() => { drag.current = null; }}
                    onKeyDown={(event) => {
                      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                      event.preventDefault();
                      resize(index, measuredWidths(), (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 32 : 12));
                    }} />
                </>
              ));
          })))}
          {body && cloneElement(body, {},
            records.length === 0 && rows.length ? rows.map(({ element }) => element) : (
              <>
                {displayOrder.map((row) => rowVisibility(row.element, !visible.has(row)))}
                {!matching.length && (
                  <tr><td className="workspace-table-empty" colSpan={Math.max(1, columns.length)}>
                    {records.length ? "No rows match this filter." : "No records to display."}
                  </td></tr>
                )}
              </>
            )
          )}
          {sections.filter((section) => section !== head && section !== body)}
        </table>
      </div>
      <div className="workspace-table-footer">
        <span role="status">
          {matching.length ? (first + 1) + "–" + Math.min(first + pageSize, matching.length) + " of " + matching.length : "0"} rows
          {activeFilters.length > 0 && matching.length !== records.length && " · " + records.length + " total"}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" className="workspace-table-button" aria-label="Previous page"
            disabled={visiblePage === 0} onClick={() => movePage(visiblePage - 1)}><ChevronLeft size={16} /></button>
          <span>Page {visiblePage + 1} of {pageCount}</span>
          <button type="button" className="workspace-table-button" aria-label="Next page"
            disabled={visiblePage + 1 >= pageCount} onClick={() => movePage(visiblePage + 1)}><ChevronRight size={16} /></button>
        </div>
      </div>
    </div>
  );
}
