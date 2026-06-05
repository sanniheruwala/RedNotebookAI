"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import type { QueryResultPayload } from "@/lib/types";
import { formatNumber } from "@/lib/utils";

export function ResultTable({ result }: { result: QueryResultPayload }) {
  const columns = React.useMemo<ColumnDef<Record<string, unknown>>[]>(
    () =>
      result.columns.map((col) => ({
        accessorKey: col.name,
        header: () => (
          <div className="flex flex-col">
            <span className="font-medium">{col.name}</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {col.data_type}
            </span>
          </div>
        ),
        cell: ({ getValue }) => <CellValue value={getValue() as unknown} />,
      })),
    [result.columns]
  );

  const table = useReactTable({
    data: result.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  if (!result.rows.length) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Query returned no rows.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <ScrollArea className="scrollbar-thin max-h-[420px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-muted/50 backdrop-blur">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b">
                {hg.headers.map((h) => (
                  <th key={h.id} className="px-3 py-2 text-left font-semibold">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-b last:border-0 even:bg-muted/20">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-1.5 font-mono">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
      <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span>
          {formatNumber(result.row_count)} rows
          {result.truncated && " (truncated)"}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Prev
          </Button>
          <span>
            Page {table.getState().pagination.pageIndex + 1} / {Math.max(1, table.getPageCount())}
          </span>
          <Button size="sm" variant="ghost" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function CellValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (typeof value === "object") {
    return <code className="text-[11px]">{JSON.stringify(value)}</code>;
  }
  if (typeof value === "boolean") return <span>{value ? "true" : "false"}</span>;
  return <span>{String(value)}</span>;
}
