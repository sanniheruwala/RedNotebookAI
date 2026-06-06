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
  CheckCircle2,
  ChevronDown,
  Copy,
  Loader2,
  Play,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResultTabs } from "@/components/notebook/result-tabs";
import { useActiveCellResult, useNotebookStore } from "@/store/notebook-store";
import { useConnectionStore } from "@/store/connection-store";
import { api } from "@/lib/api";
import { isConfigured } from "@/lib/connection";
import { formatDuration, formatNumber } from "@/lib/utils";
import type { SQLCell as SQLCellType } from "@/lib/types";

import type { OnMount } from "@monaco-editor/react";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

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

  const run = useMutation({
    mutationFn: async () => {
      if (!isConfigured(connection) || !connection) {
        throw new Error("Configure a connection first");
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

  // Keep a ref to the latest run trigger so Monaco's one-time onMount
  // keybinding always invokes the current closure (state, connection, etc.).
  const runRef = React.useRef<() => void>(() => {});
  React.useEffect(() => {
    runRef.current = () => run.mutate();
  }, [run]);

  const handleEditorMount: OnMount = React.useCallback((editor, monaco) => {
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => runRef.current());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runRef.current());
  }, []);

  const hasError = !!cellResult?.error;
  const hasResult = !!cellResult?.result;
  const isWarning = (cellResult?.guardReasons?.length ?? 0) > 0 && !hasError;
  const isRunning = run.isPending || cellResult?.running;

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
          {cellResult?.ranAt && hasResult && (
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
                  <Button
                    size="sm"
                    onClick={() => run.mutate()}
                    disabled={isRunning}
                    className="gap-1.5 shadow-sm shadow-primary/20"
                  >
                    {isRunning ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Run
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-1">
                  Run cell <Kbd className="ml-1">⇧</Kbd>
                  <Kbd>↵</Kbd>
                  <span className="text-muted-foreground/60">or</span>
                  <Kbd>⌘</Kbd>
                  <Kbd>↵</Kbd>
                </TooltipContent>
              </Tooltip>
              <Separator orientation="vertical" className="h-5" />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => explain.mutate()}
                disabled={explain.isPending}
                className="h-8 gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" /> Explain
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => optimize.mutate()}
                disabled={optimize.isPending}
                className="h-8 gap-1.5"
              >
                <Wand2 className="h-3.5 w-3.5" /> Optimize
              </Button>
            </div>

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
