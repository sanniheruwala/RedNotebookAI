"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Database,
  Download,
  Loader2,
  Play,
  Save,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { BrandMark } from "@/components/brand-mark";
import { UserMenu } from "@/components/topbar/user-menu";
import { useNotebookStore } from "@/store/notebook-store";
import { useConnectionStore } from "@/store/connection-store";
import { api } from "@/lib/api";
import { ConnectionDialog } from "@/components/sidebar/connection-dialog";

export function Topbar() {
  const title = useNotebookStore((s) => s.notebook.metadata.title);
  const setTitle = useNotebookStore((s) => s.setTitle);
  const notebook = useNotebookStore((s) => s.notebook);
  const connection = useConnectionStore((s) => s.connection);
  const ingestRunResponse = useNotebookStore((s) => s.ingestRunResponse);
  const setCellResult = useNotebookStore((s) => s.setCellResult);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 30_000,
  });

  const saveMutation = useMutation({
    mutationFn: () => api.saveNotebook(notebook.id, notebook),
    onSuccess: () => toast.success("Notebook saved"),
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const runAllMutation = useMutation({
    mutationFn: async () => {
      if (!connection?.host || !connection?.user) {
        throw new Error("Configure a Trino connection first");
      }
      const sqlCells = notebook.cells.filter((c) => c.cell_type === "sql");
      for (const cell of sqlCells) {
        if (cell.cell_type !== "sql" || !cell.sql.trim()) continue;
        setCellResult(cell.id, { running: true, error: null });
        const response = await api.runQuery({
          connection,
          sql: cell.sql,
          limit: cell.limit ?? undefined,
        });
        ingestRunResponse(cell.id, response);
      }
    },
    onSuccess: () => toast.success("All cells executed"),
    onError: (err: Error) => toast.error(err.message),
  });

  const connected = !!connection?.host;

  return (
    <header className="glass-strong sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <BrandMark withWordmark />

      <Separator orientation="vertical" className="h-7" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Untitled notebook"
          className="h-8 max-w-[28ch] border-none bg-transparent px-2 text-sm font-medium tracking-tightish shadow-none focus-visible:bg-accent focus-visible:ring-1 focus-visible:ring-ring"
        />
        <div className="hidden items-center gap-1.5 lg:flex">
          <StatusDot ok={connected} />
          <span className="text-[11px] text-muted-foreground">
            {connected ? connection.host : "Not connected"}
          </span>
          {health.data?.ai_provider && (
            <>
              <span className="text-muted-foreground/40">·</span>
              <span className="text-[11px] text-muted-foreground">
                AI:{" "}
                <span className="font-medium text-foreground">
                  {health.data.ai_provider}
                </span>
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              onClick={() => runAllMutation.mutate()}
              disabled={runAllMutation.isPending}
              className="gap-1.5 shadow-sm shadow-primary/20"
            >
              {runAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Run all
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            Run every SQL cell <Kbd>⌘</Kbd>
            <Kbd>⇧</Kbd>
            <Kbd>↵</Kbd>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-1.5"
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            Save notebook <Kbd>⌘</Kbd>
            <Kbd>S</Kbd>
          </TooltipContent>
        </Tooltip>

        <Button size="sm" variant="ghost" className="gap-1.5">
          <Download className="h-4 w-4" /> Export
        </Button>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ConnectionDialog>
          <Button size="sm" variant="outline" className="gap-2">
            <Database className="h-3.5 w-3.5" />
            <span className="max-w-[14ch] truncate text-xs">
              {connected ? connection.host : "Configure Trino"}
            </span>
          </Button>
        </ConnectionDialog>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="ghost" aria-label="Command palette">
              <Sparkles className="h-4 w-4 text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            Open command palette <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </TooltipContent>
        </Tooltip>

        <Button size="icon" variant="ghost" aria-label="Settings">
          <Settings2 className="h-4 w-4" />
        </Button>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {ok && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
      )}
      <span
        className={`relative inline-flex h-2 w-2 rounded-full ${
          ok ? "bg-primary" : "bg-muted-foreground/40"
        }`}
      />
    </span>
  );
}
