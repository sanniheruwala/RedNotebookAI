"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BookMarked,
  Download,
  Loader2,
  Play,
  Save,
  Settings2,
  Sparkles,
  Upload,
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
import { SettingsDialog } from "@/components/topbar/settings-dialog";
import { useActiveNotebook, useNotebookStore } from "@/store/notebook-store";
import { useConnectionStore } from "@/store/connection-store";
import { useUIStore } from "@/store/ui-store";
import { api } from "@/lib/api";
import { connectionLabel, isConfigured } from "@/lib/connection";
import { ConnectionPicker } from "@/components/sidebar/connection-picker";

export function Topbar() {
  const notebook = useActiveNotebook();
  const title = notebook.metadata.title;
  const setTitle = useNotebookStore((s) => s.setTitle);
  const connection = useConnectionStore((s) => s.connection);
  const openPalette = useUIStore((s) => s.setCommandPalette);
  const toggleKnowledge = useUIStore((s) => s.toggleKnowledge);
  const knowledgeOpen = useUIStore((s) => s.knowledgeOpen);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  const openTab = useNotebookStore((s) => s.openTab);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const importNotebook = React.useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.cells)) {
          throw new Error("Not a RedNotebook AI export (missing 'cells')");
        }
        // Mint a new id so we don't collide with an open notebook of the same id.
        const imported = {
          ...parsed,
          id:
            parsed.id && typeof parsed.id === "string"
              ? `${parsed.id}-import-${Date.now().toString(36)}`
              : Math.random().toString(36).slice(2),
        };
        openTab(imported);
        toast.success(`Imported "${imported.metadata?.title ?? "notebook"}"`);
      } catch (err) {
        toast.error(
          `Import failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [openTab]
  );

  const exportNotebook = React.useCallback(() => {
    const blob = new Blob([JSON.stringify(notebook, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(notebook.metadata.title || "notebook")
      .toLowerCase()
      .replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Notebook exported");
  }, [notebook]);
  const ingestRunResponse = useNotebookStore((s) => s.ingestRunResponse);
  const setCellResult = useNotebookStore((s) => s.setCellResult);

  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 30_000,
  });

  const qc = useQueryClient();
  const saveMutation = useMutation({
    mutationFn: () => api.saveNotebook(notebook.id, notebook),
    onSuccess: () => {
      // Refresh the left-panel notebook list so a rename shows up immediately.
      qc.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("Notebook saved");
    },
    onError: (err: Error) => toast.error(`Save failed: ${err.message}`),
  });

  const runAllMutation = useMutation({
    mutationFn: async () => {
      if (!isConfigured(connection) || !connection) {
        throw new Error("Configure a connection first");
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

  // Global keyboard shortcuts mirroring the topbar tooltips.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditor = target?.closest(".monaco-editor");
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && !e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveMutation.mutate();
      } else if (isMod && e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        runAllMutation.mutate();
      } else if (isMod && !e.shiftKey && e.key.toLowerCase() === "e" && !inEditor) {
        e.preventDefault();
        exportNotebook();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportNotebook]);

  const connected = isConfigured(connection);
  const connLabel = connectionLabel(connection);

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
          <span className="text-[11px] text-muted-foreground">{connLabel}</span>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Import
            </Button>
          </TooltipTrigger>
          <TooltipContent>Import notebook from JSON</TooltipContent>
        </Tooltip>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importNotebook(file);
            // Reset so picking the same file twice still fires onChange.
            e.target.value = "";
          }}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="gap-1.5"
              onClick={exportNotebook}
            >
              <Download className="h-4 w-4" /> Export
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download notebook as JSON</TooltipContent>
        </Tooltip>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ConnectionPicker />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant={knowledgeOpen ? "default" : "ghost"}
              aria-label="Knowledge drawer"
              onClick={toggleKnowledge}
            >
              <BookMarked className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Knowledge for this notebook
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Command palette"
              onClick={() => openPalette(true)}
            >
              <Sparkles className="h-4 w-4 text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent className="flex items-center gap-2">
            Open command palette <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Settings</TooltipContent>
        </Tooltip>
        <ThemeToggle />
        <UserMenu />
      </div>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
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
