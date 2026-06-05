"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Database, Download, FileText, Play, Save, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
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
        const response = await api.runQuery({ connection, sql: cell.sql, limit: cell.limit ?? undefined });
        ingestRunResponse(cell.id, response);
      }
    },
    onSuccess: () => toast.success("All cells executed"),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2 pr-2">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
          <FileText className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">RedNotebook AI</div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-7 border-none p-0 text-sm font-semibold shadow-none focus-visible:ring-0"
          />
        </div>
      </div>
      <Separator orientation="vertical" className="h-6" />
      <Button size="sm" variant="default" onClick={() => runAllMutation.mutate()} disabled={runAllMutation.isPending}>
        <Play className="h-4 w-4" /> Run all
      </Button>
      <Button size="sm" variant="outline" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
        <Save className="h-4 w-4" /> Save
      </Button>
      <Button size="sm" variant="ghost">
        <Download className="h-4 w-4" /> Export
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <ConnectionDialog>
          <Button size="sm" variant="outline">
            <Database className="h-4 w-4" />
            {connection?.host ? connection.host : "Configure Trino"}
          </Button>
        </ConnectionDialog>
        <Button size="sm" variant="ghost">
          <Sparkles className="h-4 w-4" /> AI
        </Button>
        <Button size="icon" variant="ghost">
          <Settings2 className="h-4 w-4" />
        </Button>
        <ThemeToggle />
      </div>
    </header>
  );
}
