"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { AgGridReact } from "ag-grid-react";
import type { CellDoubleClickedEvent, ColDef, GridReadyEvent, GridApi } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { Copy, Download, GripHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QueryResultPayload } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

const ROW_HEIGHT = 32;
const HEADER_HEIGHT = 36;
const PAGINATION_HEIGHT = 44;
const DEFAULT_VISIBLE_ROWS = 5;
const MIN_HEIGHT = HEADER_HEIGHT + ROW_HEIGHT + PAGINATION_HEIGHT;
const MAX_HEIGHT = 900;

function NullCell() {
  return <span className="italic opacity-50">null</span>;
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <NullCell />;
  if (typeof value === "object") return JSON.stringify(value);
  if (typeof value === "boolean") return String(value);
  return String(value);
}

function valueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (val: unknown): string => {
    const s = valueToString(val);
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const header = columns.map((c) => escape(c)).join(",");
  const body = rows
    .map((r) => columns.map((c) => escape(r[c])).join(","))
    .join("\n");
  return `${header}\n${body}`;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ResultTable({ result }: { result: QueryResultPayload }) {
  const { resolvedTheme } = useTheme();
  const gridApiRef = React.useRef<GridApi | null>(null);

  const columnDefs = React.useMemo<ColDef[]>(
    () =>
      result.columns.map((col) => ({
        field: col.name,
        headerName: col.name,
        headerTooltip: col.data_type,
        sortable: true,
        filter: true,
        resizable: true,
        minWidth: 110,
        cellRenderer: (params: { value: unknown }) => renderValue(params.value),
        cellClass: "font-mono",
        tooltipValueGetter: (p) => valueToString(p.value),
      })),
    [result.columns]
  );

  // Adaptive height: enough to show up to DEFAULT_VISIBLE_ROWS rows plus
  // header & pagination footer. User can drag the handle to grow/shrink.
  const naturalHeight = React.useMemo(() => {
    const visibleRows = Math.min(result.rows.length, DEFAULT_VISIBLE_ROWS);
    return HEADER_HEIGHT + ROW_HEIGHT * Math.max(1, visibleRows) + PAGINATION_HEIGHT;
  }, [result.rows.length]);

  const [height, setHeight] = React.useState(naturalHeight);
  React.useEffect(() => {
    setHeight(naturalHeight);
  }, [naturalHeight]);

  const draggingRef = React.useRef<{ startY: number; startH: number } | null>(null);

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = { startY: e.clientY, startH: height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
  };
  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = draggingRef.current;
    if (!d) return;
    const next = Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, d.startH + (e.clientY - d.startY)));
    setHeight(next);
  };
  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  const onGridReady = (e: GridReadyEvent) => {
    gridApiRef.current = e.api;
  };

  // Double-clicking a cell copies its raw value (without quotes / null
  // placeholder) so analysts can paste IDs straight into the editor.
  const onCellDoubleClicked = async (e: CellDoubleClickedEvent) => {
    const val = valueToString(e.value);
    try {
      await navigator.clipboard.writeText(val);
      toast.success("Copied cell", { duration: 1200 });
    } catch {
      toast.error("Clipboard blocked by browser");
    }
  };

  const copyAll = async () => {
    const cols = result.columns.map((c) => c.name);
    const tsv = [cols.join("\t"), ...result.rows.map((r) => cols.map((c) => valueToString(r[c])).join("\t"))].join("\n");
    try {
      await navigator.clipboard.writeText(tsv);
      toast.success(`Copied ${formatNumber(result.rows.length)} rows`);
    } catch {
      toast.error("Clipboard blocked by browser");
    }
  };

  const downloadCsv = () => {
    const cols = result.columns.map((c) => c.name);
    download("result.csv", toCsv(cols, result.rows), "text/csv");
  };

  const downloadJson = () => {
    download("result.json", JSON.stringify(result.rows, null, 2), "application/json");
  };

  if (!result.rows.length) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Query returned no rows.
      </div>
    );
  }

  const themeClass =
    resolvedTheme === "dark" ? "ag-theme-quartz-dark" : "ag-theme-quartz";

  return (
    <div className="rounded-xl border bg-card">
      <div
        className={`${themeClass} ag-rednotebook`}
        style={{ height, width: "100%" }}
      >
        <AgGridReact
          rowData={result.rows}
          columnDefs={columnDefs}
          defaultColDef={{
            flex: 1,
            cellStyle: { fontSize: "12px" },
          }}
          rowHeight={ROW_HEIGHT}
          headerHeight={HEADER_HEIGHT}
          animateRows
          suppressCellFocus={false}
          pagination
          paginationPageSize={50}
          paginationPageSizeSelector={[25, 50, 100, 200]}
          tooltipShowDelay={300}
          onGridReady={onGridReady}
          onCellDoubleClicked={onCellDoubleClicked}
        />
      </div>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize table"
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        className="group/handle flex h-2 cursor-row-resize touch-none items-center justify-center border-y border-transparent hover:border-border hover:bg-muted/40"
      >
        <GripHorizontal className="h-3 w-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover/handle:opacity-100" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          {formatNumber(result.row_count)} rows
          {result.truncated && " (truncated)"}
          <span className="ml-2 text-muted-foreground/60">· double-click a cell to copy</span>
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={copyAll} className="h-7 gap-1.5 text-[11px]">
            <Copy className="h-3 w-3" /> Copy
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-[11px]">
                <Download className="h-3 w-3" /> Download
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={downloadCsv}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={downloadJson}>JSON</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="ml-2 text-[10px] uppercase tracking-widest">
            {result.columns.length} cols
          </span>
        </div>
      </div>
    </div>
  );
}
