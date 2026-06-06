"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { AgGridReact } from "ag-grid-react";
import type { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import type { QueryResultPayload } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export function ResultTable({ result }: { result: QueryResultPayload }) {
  const { resolvedTheme } = useTheme();

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
        cellRenderer: (params: { value: unknown }) => {
          const v = params.value;
          if (v === null || v === undefined) {
            return '<span style="opacity:0.5;font-style:italic">null</span>';
          }
          if (typeof v === "object") return JSON.stringify(v);
          if (typeof v === "boolean") return String(v);
          return String(v);
        },
        cellClass: "font-mono",
      })),
    [result.columns]
  );

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
        style={{ height: 420, width: "100%" }}
      >
        <AgGridReact
          rowData={result.rows}
          columnDefs={columnDefs}
          defaultColDef={{
            flex: 1,
            cellStyle: { fontSize: "12px" },
          }}
          rowHeight={32}
          headerHeight={36}
          animateRows
          suppressCellFocus={false}
          pagination
          paginationPageSize={50}
          paginationPageSizeSelector={[25, 50, 100, 200]}
          tooltipShowDelay={300}
        />
      </div>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          {formatNumber(result.row_count)} rows
          {result.truncated && " (truncated)"}
        </span>
        <span className="text-[10px] uppercase tracking-widest">
          {result.columns.length} cols
        </span>
      </div>
    </div>
  );
}
