"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Copy,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ResultTabs } from "@/components/notebook/result-tabs";
import { useNotebookStore } from "@/store/notebook-store";
import { useConnectionStore } from "@/store/connection-store";
import { api } from "@/lib/api";
import { formatDuration, formatNumber } from "@/lib/utils";
import type { SQLCell as SQLCellType } from "@/lib/types";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export function SQLCell({ cell }: { cell: SQLCellType }) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const removeCell = useNotebookStore((s) => s.removeCell);
  const duplicateCell = useNotebookStore((s) => s.duplicateCell);
  const moveCell = useNotebookStore((s) => s.moveCell);
  const setCellResult = useNotebookStore((s) => s.setCellResult);
  const ingestRunResponse = useNotebookStore((s) => s.ingestRunResponse);
  const cellResult = useNotebookStore((s) => s.cellResults[cell.id]);
  const connection = useConnectionStore((s) => s.connection);

  const run = useMutation({
    mutationFn: async () => {
      if (!connection?.host || !connection?.user) {
        throw new Error("Configure a Trino connection first");
      }
      setCellResult(cell.id, { running: true, error: null });
      return api.runQuery({ connection, sql: cell.sql, limit: cell.limit ?? undefined });
    },
    onSuccess: (response) => {
      ingestRunResponse(cell.id, response);
      if (!response.ok) toast.error(response.error || "Query failed");
    },
    onError: (err: Error) => {
      setCellResult(cell.id, { running: false, error: err.message });
      toast.error(err.message);
    },
  });

  const explain = useMutation({
    mutationFn: () => api.aiExplainSQL({ sql: cell.sql, context: {} }),
    onSuccess: (res) => toast.message("Explanation", { description: res.text.slice(0, 300) }),
    onError: (err: Error) => toast.error(err.message),
  });

  const optimize = useMutation({
    mutationFn: () => api.aiOptimizeSQL({ sql: cell.sql, context: {} }),
    onSuccess: (res) =>
      updateCell(cell.id, (c) => (c.cell_type === "sql" ? { ...c, sql: res.text } : c)),
    onError: (err: Error) => toast.error(err.message),
  });

  const onChange = (next: string | undefined) =>
    updateCell(cell.id, (c) => (c.cell_type === "sql" ? { ...c, sql: next ?? "" } : c));

  return (
    <div className="group rounded-2xl border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between border-b px-3 py-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="text-[10px] uppercase tracking-widest">SQL</Badge>
          {cellResult?.ranAt && (
            <span>
              {formatNumber(cellResult.result?.row_count ?? 0)} rows ·{" "}
              {formatDuration(cellResult.result?.duration_seconds ?? 0)}
            </span>
          )}
          {cellResult?.guardReasons?.length ? (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="h-3 w-3" /> {cellResult.guardReasons[0]}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="icon" variant="ghost" onClick={() => moveCell(cell.id, "up")} title="Move up">
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => moveCell(cell.id, "down")} title="Move down">
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => duplicateCell(cell.id)} title="Duplicate">
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => removeCell(cell.id)} title="Delete">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="rounded-b-2xl">
        <div className="border-b">
          <MonacoEditor
            height="180px"
            language="sql"
            theme="vs-dark"
            value={cell.sql}
            onChange={onChange}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "on",
              scrollBeyondLastLine: false,
              renderLineHighlight: "gutter",
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending}>
            {run.isPending || cellResult?.running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <Button size="sm" variant="ghost" onClick={() => explain.mutate()} disabled={explain.isPending}>
            <Sparkles className="h-4 w-4" /> Explain
          </Button>
          <Button size="sm" variant="ghost" onClick={() => optimize.mutate()} disabled={optimize.isPending}>
            <Wand2 className="h-4 w-4" /> Optimize
          </Button>
        </div>
        {cellResult?.error && (
          <div className="mx-3 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {cellResult.error}
          </div>
        )}
        {cellResult?.result && (
          <div className="px-3 pb-3">
            <ResultTabs cell={cell} result={cellResult.result} />
          </div>
        )}
      </div>
    </div>
  );
}
