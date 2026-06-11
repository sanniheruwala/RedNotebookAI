"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { History, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useNotebookStore } from "@/store/notebook-store";

type Commit = {
  sha: string;
  short_sha: string;
  timestamp: number;
  iso_timestamp: string;
  author_name: string;
  author_email: string;
  message: string;
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function NotebookHistoryDialog({
  open,
  onOpenChange,
  notebookId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookId: string;
}) {
  const isReal = notebookId && notebookId !== "empty";
  const qc = useQueryClient();
  const replaceNotebook = useNotebookStore((s) => s.replaceNotebook);
  const [selectedSha, setSelectedSha] = React.useState<string | null>(null);

  const history = useQuery({
    queryKey: ["notebook-history", notebookId],
    queryFn: () => api.notebookHistory(notebookId),
    enabled: open && !!isReal,
    // History is a function of disk state — fetch fresh every open so a
    // save made between dialog opens shows up.
    staleTime: 0,
  });

  React.useEffect(() => {
    if (!open) setSelectedSha(null);
  }, [open]);

  const preview = useQuery({
    queryKey: ["notebook-at-commit", notebookId, selectedSha],
    queryFn: () =>
      selectedSha
        ? api.notebookAtCommit(notebookId, selectedSha)
        : Promise.resolve(null),
    enabled: open && !!isReal && !!selectedSha,
  });

  const restore = useMutation({
    mutationFn: () => {
      if (!selectedSha) throw new Error("Pick a commit first");
      return api.restoreNotebook(notebookId, selectedSha);
    },
    onSuccess: async () => {
      // Pull the freshly-restored notebook into the active tab.
      const fresh = await api.notebookAtCommit(
        notebookId,
        (await api.notebookHistory(notebookId)).commits[0]?.sha ?? "",
      ).catch(() => null);
      if (fresh) replaceNotebook(fresh.notebook);
      qc.invalidateQueries({ queryKey: ["notebook-history", notebookId] });
      qc.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("Notebook restored");
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[78vh] max-w-4xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Notebook history</DialogTitle>
        <DialogDescription className="sr-only">
          Git-backed history of every save. Pick a commit to preview or restore.
        </DialogDescription>

        <div className="flex items-center justify-between border-b bg-background/80 px-5 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
              <History className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tightish">
                History
              </div>
              <div className="text-[11px] text-muted-foreground">
                Every save is a checkpoint you can roll back to.
              </div>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {!isReal ? (
          <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
            Open a notebook first.
          </div>
        ) : (
          <div className="grid h-full grid-cols-[280px_1fr] overflow-hidden">
            <aside className="overflow-hidden border-r">
              {history.isPending ? (
                <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading…
                </div>
              ) : history.error ? (
                <div className="p-4 text-xs text-destructive">
                  {(history.error as Error).message}
                </div>
              ) : (history.data?.commits ?? []).length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">
                  No saved versions yet. Hit save (or just edit — autosave
                  fires within a second or two) to start a history.
                </div>
              ) : (
                <ScrollArea className="scrollbar-thin h-full">
                  <ul className="p-2">
                    {history.data!.commits.map((c) => (
                      <CommitRow
                        key={c.sha}
                        commit={c}
                        selected={c.sha === selectedSha}
                        onSelect={() => setSelectedSha(c.sha)}
                      />
                    ))}
                  </ul>
                </ScrollArea>
              )}
            </aside>
            <section className="flex flex-col overflow-hidden">
              {!selectedSha ? (
                <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
                  Pick a commit on the left to preview it.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b bg-muted/20 px-5 py-2.5 text-xs">
                    <div className="flex items-center gap-2">
                      <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[10px]">
                        {selectedSha.slice(0, 7)}
                      </code>
                      <span className="text-muted-foreground">
                        Preview — the live notebook is unchanged until you
                        click Restore.
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => restore.mutate()}
                      disabled={restore.isPending}
                      className="h-8 gap-1.5 shadow-sm shadow-primary/20"
                    >
                      {restore.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3.5 w-3.5" />
                      )}
                      Restore this version
                    </Button>
                  </div>
                  <ScrollArea className="scrollbar-thin flex-1">
                    {preview.isPending ? (
                      <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Loading snapshot…
                      </div>
                    ) : preview.error ? (
                      <div className="p-6 text-xs text-destructive">
                        {(preview.error as Error).message}
                      </div>
                    ) : preview.data ? (
                      <CommitPreview notebook={preview.data.notebook} />
                    ) : null}
                  </ScrollArea>
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CommitRow({
  commit,
  selected,
  onSelect,
}: {
  commit: Commit;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent ${
          selected ? "bg-accent" : ""
        }`}
      >
        <div className="line-clamp-2 w-full font-medium">{commit.message}</div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <code className="rounded bg-muted/60 px-1 font-mono">
            {commit.short_sha}
          </code>
          <span>·</span>
          <span>{commit.author_name || "anonymous"}</span>
          <span>·</span>
          <span>{relativeTime(commit.iso_timestamp)}</span>
        </div>
      </button>
    </li>
  );
}

// Lightweight preview of a notebook snapshot — title, cell count, and an
// outline of cell types so the user can confirm they're about to restore
// the right version without having to read every cell.
function CommitPreview({
  notebook,
}: {
  notebook: { metadata: { title: string }; cells: Array<{ cell_type: string }> };
}) {
  const cellTypeCounts = notebook.cells.reduce<Record<string, number>>(
    (acc, c) => {
      acc[c.cell_type] = (acc[c.cell_type] ?? 0) + 1;
      return acc;
    },
    {},
  );
  return (
    <div className="space-y-4 px-6 py-5">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Title at this point
        </div>
        <h2 className="mt-1 text-balance text-xl font-semibold tracking-tightish">
          {notebook.metadata.title}
        </h2>
      </div>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Structure
        </div>
        <ul className="space-y-1 text-xs">
          <li className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Total cells</span>
            <span className="font-medium tabular-nums">
              {notebook.cells.length}
            </span>
          </li>
          {Object.entries(cellTypeCounts).map(([type, count]) => (
            <li
              key={type}
              className="flex items-baseline justify-between text-muted-foreground"
            >
              <span className="font-mono text-[11px]">{type}</span>
              <span className="tabular-nums">{count}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
