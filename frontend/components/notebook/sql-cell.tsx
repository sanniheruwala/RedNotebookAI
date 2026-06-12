"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Braces,
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Play,
  Sparkles,
  Square,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { format as sqlFormat } from "sql-formatter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Markdown } from "@/components/markdown";
import { ResultTabs } from "@/components/notebook/result-tabs";
import { useActiveCellResult, useNotebookStore } from "@/store/notebook-store";
import { useConnectionStore } from "@/store/connection-store";
import { api } from "@/lib/api";
import { isConfigured } from "@/lib/connection";
import { computeAggregatedStats } from "@/lib/result-stats";
import { requestImmediateSave } from "@/hooks/use-autosave";
import { formatDuration, formatNumber } from "@/lib/utils";
import type { SQLCell as SQLCellType } from "@/lib/types";

import type { OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditorNS } from "monaco-editor";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// connector_type → sql-formatter dialect. Every connector we ship maps to
// a real dialect 1:1; only Databricks needs translation (it speaks Spark
// SQL under the hood). Fallback is the generic "sql" dialect.
const SQL_DIALECT_FOR_CONNECTOR: Record<string, string> = {
  duckdb: "duckdb",
  trino: "trino",
  postgresql: "postgresql",
  mysql: "mysql",
  mariadb: "mariadb",
  sqlite: "sqlite",
  mssql: "transactsql",
  snowflake: "snowflake",
  bigquery: "bigquery",
  redshift: "redshift",
  oracle: "plsql",
  clickhouse: "clickhouse",
  databricks: "spark",
};

export function SQLCell({ cell }: { cell: SQLCellType }) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const removeCell = useNotebookStore((s) => s.removeCell);
  const duplicateCell = useNotebookStore((s) => s.duplicateCell);
  const moveCell = useNotebookStore((s) => s.moveCell);
  const setCellResult = useNotebookStore((s) => s.setCellResult);
  const ingestRunResponse = useNotebookStore((s) => s.ingestRunResponse);
  const cellResult = useActiveCellResult(cell.id);
  const connection = useConnectionStore((s) => s.connection);
  const { resolvedTheme } = useTheme();
  const [collapsed, setCollapsed] = React.useState(false);

  // AbortController for the in-flight query — re-created per run so a
  // previous abort doesn't poison the next attempt. Stored in a ref so the
  // Stop button has a stable handle to .abort() on click.
  const abortRef = React.useRef<AbortController | null>(null);
  // Client-minted id for the in-flight query. The server registers a
  // per-engine cancel hook (DuckDB interrupt / Trino DELETE / Postgres
  // pg_cancel_backend) against this id; the Stop button fires
  // /api/query/cancel/<id> before aborting the fetch.
  const queryIdRef = React.useRef<string | null>(null);

  // Latest Monaco instance, captured on mount. We grab the live selection
  // at run time so the user can highlight one statement and run *just*
  // that — common when a cell holds a few exploratory snippets.
  const editorRef = React.useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(
    null,
  );
  const [hasSelection, setHasSelection] = React.useState(false);

  const resolveSqlToRun = React.useCallback((): string => {
    const editor = editorRef.current;
    if (editor) {
      const model = editor.getModel();
      const sel = editor.getSelection();
      if (model && sel && !sel.isEmpty()) {
        const text = model.getValueInRange(sel).trim();
        if (text) return text;
      }
    }
    return cell.sql;
  }, [cell.sql]);

  const run = useMutation({
    mutationFn: async () => {
      if (!isConfigured(connection) || !connection) {
        throw new Error("Configure a connection first");
      }
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const qid =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `q-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      queryIdRef.current = qid;
      setCellResult(cell.id, {
        running: true,
        error: null,
        startedAt: Date.now(),
      });
      return api.runQuery(
        {
          connection,
          sql: resolveSqlToRun(),
          limit: cell.limit ?? undefined,
          query_id: qid,
        },
        controller.signal,
      );
    },
    onSuccess: (response) => {
      ingestRunResponse(cell.id, response);
      if (!response.ok) toast.error(response.error || "Query failed");
      // Snapshot the notebook the moment a run completes so the user
      // gets a checkpoint in history even before the debounce window
      // would have fired.
      requestImmediateSave();
    },
    onError: (err: Error) => {
      // AbortController.abort() rejects the fetch with an AbortError. Treat
      // that as a user-initiated stop, not a query failure.
      const aborted =
        err.name === "AbortError" ||
        /aborted/i.test(err.message);
      setCellResult(cell.id, {
        running: false,
        error: aborted ? null : err.message,
        startedAt: null,
      });
      if (!aborted) toast.error(err.message);
    },
  });

  const stop = React.useCallback(() => {
    // Fire the server-side cancel first so the engine starts tearing
    // down before we abort the fetch. Best-effort: any error from the
    // cancel call is swallowed — the user already wants this to stop.
    const qid = queryIdRef.current;
    if (qid) {
      api.cancelQuery(qid).catch(() => {});
    }
    abortRef.current?.abort();
    abortRef.current = null;
    queryIdRef.current = null;
  }, []);

  // Abort any in-flight query if the cell unmounts (e.g., notebook close).
  React.useEffect(() => () => abortRef.current?.abort(), []);

  // Inline summary panel state. The summarize-result button replaced the
  // older "Explain SQL" affordance — explaining the query text alone wasn't
  // pulling its weight; what users actually want is a deep read of the
  // *result* (numbers, outliers, follow-ups).
  const [summary, setSummary] = React.useState<{ text: string; provider?: string } | null>(null);
  const summaryToastId = `summary-${cell.id}`;
  const result = cellResult?.result ?? null;
  const summarize = useMutation({
    mutationFn: () => {
      if (!result) throw new Error("Run the query first — nothing to summarize");
      return api.aiExplainResult({
        sql: cell.sql,
        columns: result.columns,
        sample_rows: result.rows.slice(0, 20),
        row_count: result.row_count,
        aggregated_stats: computeAggregatedStats(result),
      });
    },
    onMutate: () => {
      toast.loading("AI is summarizing your result…", { id: summaryToastId });
    },
    onSuccess: (res) => {
      setSummary({ text: res.text, provider: res.provider });
      toast.dismiss(summaryToastId);
    },
    onError: (err: Error) => toast.error(err.message, { id: summaryToastId }),
  });

  const optimizeToastId = `optimize-${cell.id}`;
  const optimize = useMutation({
    mutationFn: () => api.aiOptimizeSQL({ sql: cell.sql, context: {} }),
    onMutate: () => {
      toast.loading("AI is optimizing your SQL…", { id: optimizeToastId });
    },
    onSuccess: (res) => {
      updateCell(cell.id, (c) => (c.cell_type === "sql" ? { ...c, sql: res.text } : c));
      toast.success("SQL optimized — cell updated", { id: optimizeToastId });
    },
    onError: (err: Error) => toast.error(err.message, { id: optimizeToastId }),
  });

  const onChange = (next: string | undefined) =>
    updateCell(cell.id, (c) => (c.cell_type === "sql" ? { ...c, sql: next ?? "" } : c));

  // Pretty-print the cell's SQL using the dialect that matches the active
  // connection. Done client-side via `sql-formatter` so there's no round
  // trip — the formatted text replaces the cell content immediately and
  // autosave picks it up on the next debounce tick.
  const formatSql = React.useCallback(() => {
    const raw = cell.sql ?? "";
    if (!raw.trim()) return;
    const dialect =
      (connection &&
        SQL_DIALECT_FOR_CONNECTOR[
          (connection as { connector_type?: string }).connector_type ?? ""
        ]) ||
      "sql";
    try {
      const pretty = sqlFormat(raw, {
        language: dialect as Parameters<typeof sqlFormat>[1] extends infer T
          ? T extends { language?: infer L }
            ? L
            : never
          : never,
        keywordCase: "upper",
        tabWidth: 2,
      });
      if (pretty === raw) return;
      updateCell(cell.id, (c) =>
        c.cell_type === "sql" ? { ...c, sql: pretty } : c,
      );
    } catch (err) {
      toast.error(
        `Format failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }, [cell.id, cell.sql, connection, updateCell]);

  // Keep a ref to the latest run trigger so Monaco's one-time onMount
  // keybinding always invokes the current closure (state, connection, etc.).
  const runRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    runRef.current = () => run.mutate();
  }, [run]);

  const handleEditorMount: OnMount = React.useCallback((editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => runRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
    // Track whether the editor has a non-empty selection so the Run button
    // can hint "Run selection" — purely cosmetic, the actual decision is
    // re-checked in resolveSqlToRun at submit time.
    const updateSelectionState = () => {
      const sel = editor.getSelection();
      setHasSelection(!!sel && !sel.isEmpty());
    };
    editor.onDidChangeCursorSelection(updateSelectionState);
    updateSelectionState();
  }, []);

  const hasError = !!cellResult?.error;
  const hasResult = !!cellResult?.result;
  const isWarning = (cellResult?.guardReasons?.length ?? 0) > 0 && !hasError;
  const isRunning = run.isPending || cellResult?.running;

  // Live timer that ticks every 100ms while the query is in flight. Uses a
  // ref so the interval doesn't re-create on every render; clears on stop.
  const startedAt = cellResult?.startedAt ?? null;
  const [elapsedMs, setElapsedMs] = React.useState(0);
  React.useEffect(() => {
    if (!isRunning || !startedAt) {
      setElapsedMs(0);
      return;
    }
    setElapsedMs(Date.now() - startedAt);
    const t = setInterval(() => setElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(t);
  }, [isRunning, startedAt]);

  return (
    <div className="card-premium group/cell relative overflow-hidden">
      <div
        className={`absolute inset-y-0 left-0 w-[3px] transition-all ${
          isRunning
            ? "bg-primary/70"
            : hasError
              ? "bg-destructive/70"
              : hasResult
                ? "bg-primary/40"
                : isWarning
                  ? "bg-amber-500/70"
                  : "bg-transparent"
        }`}
      />

      <div className="flex items-center justify-between border-b border-border/60 bg-muted/30 px-3 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-xs">
          <Badge
            variant="secondary"
            className="h-5 gap-1 rounded-md px-1.5 text-[10px] font-semibold uppercase tracking-wider"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            SQL
          </Badge>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="tabular-nums">
                {formatDuration(elapsedMs / 1000)}
              </span>
            </span>
          )}
          {!isRunning && cellResult?.ranAt && hasResult && (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-primary" />
              <span className="tabular-nums">
                {formatNumber(cellResult.result?.row_count ?? 0)} rows
              </span>
              <span className="text-muted-foreground/40">·</span>
              <span className="tabular-nums">
                {formatDuration(cellResult.result?.duration_seconds ?? 0)}
              </span>
            </span>
          )}
          {isWarning && (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="h-3 w-3" />
              {cellResult?.guardReasons?.[0]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/cell:opacity-100">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => setCollapsed((c) => !c)}
              >
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${collapsed ? "-rotate-90" : ""}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Collapse / expand</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => moveCell(cell.id, "up")}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Move up <Kbd className="ml-1">⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>↑</Kbd>
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={() => moveCell(cell.id, "down")}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Move down <Kbd className="ml-1">⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>↓</Kbd>
            </TooltipContent>
          </Tooltip>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => duplicateCell(cell.id)}
            title="Duplicate"
          >
            <Copy className="h-3.5 w-3.5" />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={formatSql}
                disabled={!cell.sql.trim()}
                aria-label="Format SQL"
              >
                <Braces className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Format SQL — dialect-aware pretty-print</TooltipContent>
          </Tooltip>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            onClick={() => removeCell(cell.id)}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-b border-border/60">
              <MonacoEditor
                height="180px"
                language="sql"
                theme={resolvedTheme === "dark" ? "vs-dark" : "vs"}
                value={cell.sql}
                onChange={onChange}
                onMount={handleEditorMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily:
                    "var(--font-mono), 'JetBrains Mono', 'SF Mono', Menlo, monospace",
                  fontLigatures: true,
                  lineNumbers: "on",
                  lineNumbersMinChars: 3,
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "gutter",
                  automaticLayout: true,
                  padding: { top: 14, bottom: 14 },
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  scrollbar: {
                    verticalScrollbarSize: 6,
                    horizontalScrollbarSize: 6,
                  },
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  {isRunning ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={stop}
                      className="gap-1.5 shadow-sm"
                    >
                      <Square className="h-3.5 w-3.5 fill-current" />
                      Stop
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => run.mutate()}
                      className="gap-1.5 shadow-sm shadow-primary/20"
                    >
                      <Play className="h-4 w-4" />
                      {hasSelection ? "Run selection" : "Run"}
                    </Button>
                  )}
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-1">
                  {isRunning ? (
                    <span className="text-balance">
                      Asks the engine to cancel the query (DuckDB,
                      Trino, Postgres, MySQL, MariaDB, Redshift). For
                      other engines the HTTP request is aborted and the
                      server-side query is left to finish on its own.
                    </span>
                  ) : (
                    <>
                      Run cell <Kbd className="ml-1">⇧</Kbd>
                      <Kbd>↵</Kbd>
                      <span className="text-muted-foreground/60">or</span>
                      <Kbd>⌘</Kbd>
                      <Kbd>↵</Kbd>
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-5" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => summarize.mutate()}
                    disabled={summarize.isPending || isRunning || !hasResult}
                    className="h-8 gap-1.5"
                  >
                    {summarize.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                    )}
                    {summarize.isPending ? "Summarizing…" : "Summarize result"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {hasResult
                    ? "Deep-read the result — numbers, outliers, follow-ups"
                    : "Run the query first"}
                </TooltipContent>
              </Tooltip>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => optimize.mutate()}
                disabled={optimize.isPending || isRunning}
                className="h-8 gap-1.5"
              >
                {optimize.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
                {optimize.isPending ? "Optimizing…" : "Optimize"}
              </Button>
            </div>

            <AnimatePresence>
              {summary && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-3 mb-3 rounded-xl border border-primary/30 bg-primary/[0.04] p-3"
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-primary">
                      <Sparkles className="h-3 w-3" />
                      Result summary
                      {summary.provider && (
                        <span className="font-normal text-muted-foreground/80">
                          · {summary.provider}
                        </span>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5"
                      onClick={() => setSummary(null)}
                      aria-label="Dismiss summary"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                  <Markdown variant="cell">{summary.text}</Markdown>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {cellResult?.error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mx-3 mb-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
                >
                  <div className="font-semibold">Query failed</div>
                  <div className="mt-0.5 font-mono leading-relaxed opacity-80">
                    {cellResult.error}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {cellResult?.result && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                  className="px-3 pb-3"
                >
                  <ResultTabs cell={cell} result={cellResult.result} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
