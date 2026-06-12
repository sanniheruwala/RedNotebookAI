"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertCircle,
  Bot,
  FileText,
  GitCommitVertical,
  History,
  Image as ImageIcon,
  Loader2,
  RotateCcw,
  StickyNote,
  Terminal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/markdown";
import { api } from "@/lib/api";
import { useNotebookStore } from "@/store/notebook-store";

// ---------------------------------------------------------------------------
// Types + helpers
// ---------------------------------------------------------------------------
type Commit = {
  sha: string;
  short_sha: string;
  timestamp: number;
  iso_timestamp: string;
  author_name: string;
  author_email: string;
  message: string;
};

type NotebookSnapshot = {
  metadata: { title: string };
  cells: Array<
    | { id: string; cell_type: "markdown"; source: string }
    | { id: string; cell_type: "sql"; sql: string }
    | {
        id: string;
        cell_type: "ai_prompt";
        prompt?: string;
        response?: string | null;
      }
    | {
        id: string;
        cell_type: "visualization";
        chart_config?: { chart_type?: string; x?: string; y?: string };
      }
    | {
        id: string;
        cell_type: "knowledge_note";
        title?: string;
        body?: string;
      }
    | { id: string; cell_type: string }
  >;
};

const TIME_BUCKETS: Array<{ label: string; within: number }> = [
  { label: "Today", within: 24 * 60 * 60 * 1000 },
  { label: "Yesterday", within: 2 * 24 * 60 * 60 * 1000 },
  { label: "This week", within: 7 * 24 * 60 * 60 * 1000 },
  { label: "Last week", within: 14 * 24 * 60 * 60 * 1000 },
  { label: "Earlier", within: Number.POSITIVE_INFINITY },
];

function bucketCommitsByTime(commits: Commit[]): Array<{
  label: string;
  commits: Commit[];
}> {
  const now = Date.now();
  const groups: Record<string, Commit[]> = Object.fromEntries(
    TIME_BUCKETS.map((b) => [b.label, []]),
  );
  for (const c of commits) {
    const age = now - new Date(c.iso_timestamp).getTime();
    const bucket =
      TIME_BUCKETS.find((b) => age <= b.within) ??
      TIME_BUCKETS[TIME_BUCKETS.length - 1];
    groups[bucket.label].push(c);
  }
  // Today exists separately from Yesterday — drop empties so the timeline
  // doesn't print headers no commits belong to.
  return TIME_BUCKETS.map((b) => ({
    label: b.label,
    commits: groups[b.label],
  })).filter((g) => g.commits.length > 0);
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return iso;
  const diff = Date.now() - t;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Top-level dialog
// ---------------------------------------------------------------------------
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
    staleTime: 0,
  });

  // Default-select the most recent commit on open so the user lands on a
  // populated preview instead of an "Pick a commit" placeholder.
  React.useEffect(() => {
    if (!open) {
      setSelectedSha(null);
      return;
    }
    const first = history.data?.commits?.[0]?.sha;
    if (first && !selectedSha) setSelectedSha(first);
    // We intentionally only watch `open` + first commit — re-selecting on
    // every query refetch would yank the user out of their current pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, history.data?.commits?.[0]?.sha]);

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

  // Stable-reference commits — the `?? []` fallback created a new array
  // every render before, invalidating the useMemo dep arrays below.
  const commits = React.useMemo(
    () => history.data?.commits ?? [],
    [history.data?.commits],
  );
  const groups = React.useMemo(() => bucketCommitsByTime(commits), [commits]);
  const selectedCommit = React.useMemo(
    () => commits.find((c) => c.sha === selectedSha) ?? null,
    [commits, selectedSha],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[82vh] max-w-5xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Notebook history</DialogTitle>
        <DialogDescription className="sr-only">
          Git-backed history of every save. Pick a commit to preview or restore.
        </DialogDescription>

        <header className="flex items-center justify-between border-b bg-gradient-to-r from-background via-background to-primary/[0.02] px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/30 shadow-sm shadow-primary/10">
              <History className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <div className="text-[15px] font-semibold tracking-tightish">
                Notebook history
              </div>
              <div className="text-[11.5px] text-muted-foreground">
                {commits.length > 0
                  ? `${commits.length} ${commits.length === 1 ? "version" : "versions"} saved · click any to preview`
                  : "Every edit autosaves a new checkpoint"}
              </div>
            </div>
          </div>
        </header>

        {!isReal ? (
          <div className="flex items-center justify-center p-10 text-sm text-muted-foreground">
            Open a notebook first.
          </div>
        ) : (
          <div className="grid min-h-0 grid-cols-[300px_1fr] overflow-hidden">
            <Timeline
              isPending={history.isPending}
              error={history.error as Error | null}
              groups={groups}
              selectedSha={selectedSha}
              onSelect={setSelectedSha}
            />
            <PreviewPane
              commit={selectedCommit}
              snapshot={preview.data?.notebook as NotebookSnapshot | undefined}
              loading={preview.isPending}
              error={preview.error as Error | null}
              onRestore={() => restore.mutate()}
              restoring={restore.isPending}
              hasCommits={commits.length > 0}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Left pane — time-grouped timeline
// ---------------------------------------------------------------------------
function Timeline({
  isPending,
  error,
  groups,
  selectedSha,
  onSelect,
}: {
  isPending: boolean;
  error: Error | null;
  groups: Array<{ label: string; commits: Commit[] }>;
  selectedSha: string | null;
  onSelect: (sha: string) => void;
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-r bg-muted/[0.06]">
      {isPending ? (
        <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
        </div>
      ) : error ? (
        <div className="m-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error.message}</span>
        </div>
      ) : groups.length === 0 ? (
        <HistoryEmpty />
      ) : (
        <ScrollArea className="scrollbar-thin flex-1">
          <div className="px-3 py-2">
            {groups.map((g) => (
              <TimelineGroup
                key={g.label}
                label={g.label}
                commits={g.commits}
                selectedSha={selectedSha}
                onSelect={onSelect}
              />
            ))}
          </div>
        </ScrollArea>
      )}
    </aside>
  );
}

function TimelineGroup({
  label,
  commits,
  selectedSha,
  onSelect,
}: {
  label: string;
  commits: Commit[];
  selectedSha: string | null;
  onSelect: (sha: string) => void;
}) {
  return (
    <div className="mb-4 last:mb-1">
      <div className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
        {label}
      </div>
      <ol className="relative space-y-0.5 pl-5 before:absolute before:left-[7px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-border/70">
        {commits.map((c) => (
          <TimelineRow
            key={c.sha}
            commit={c}
            selected={c.sha === selectedSha}
            onSelect={() => onSelect(c.sha)}
          />
        ))}
      </ol>
    </div>
  );
}

function TimelineRow({
  commit,
  selected,
  onSelect,
}: {
  commit: Commit;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li className="relative">
      {/* Timeline dot, sits ON the vertical rail (-left-[15px]). Selected
          state gets the primary halo so the user can scan-find their pick. */}
      <span
        aria-hidden
        className={`absolute -left-[14px] top-[10px] grid h-3 w-3 place-items-center rounded-full ring-2 ${
          selected
            ? "bg-primary ring-primary/30 shadow-[0_0_0_4px_rgba(34,197,94,0.18)]"
            : "bg-background ring-border"
        }`}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full ${selected ? "bg-background" : "bg-muted-foreground/50"}`}
        />
      </span>
      <button
        type="button"
        onClick={onSelect}
        className={`flex w-full flex-col items-start gap-1 rounded-lg px-2.5 py-1.5 text-left transition-colors ${
          selected
            ? "bg-primary/10 ring-1 ring-inset ring-primary/30"
            : "hover:bg-accent"
        }`}
      >
        <div
          className={`line-clamp-2 w-full text-[12.5px] font-medium leading-snug ${
            selected ? "text-foreground" : "text-foreground/90"
          }`}
        >
          {commit.message}
        </div>
        <div className="flex w-full items-center gap-1.5 text-[10.5px] text-muted-foreground">
          <span
            className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-[8.5px] font-bold uppercase tracking-wide text-primary"
            title={commit.author_email}
          >
            {initials(commit.author_name || commit.author_email)}
          </span>
          <span className="truncate">{commit.author_name || "anonymous"}</span>
          <span className="text-muted-foreground/40">·</span>
          <code
            className="rounded bg-muted/60 px-1 py-px font-mono text-[10px]"
            title={commit.sha}
          >
            {commit.short_sha}
          </code>
          <span className="ml-auto whitespace-nowrap text-muted-foreground/80">
            {relativeTime(commit.iso_timestamp)}
          </span>
        </div>
      </button>
    </li>
  );
}

function HistoryEmpty() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20">
        <GitCommitVertical className="h-6 w-6" />
      </div>
      <div className="text-sm font-semibold">No versions saved yet</div>
      <p className="max-w-[18rem] text-[11.5px] leading-relaxed text-muted-foreground">
        Edit any cell or hit{" "}
        <kbd className="rounded border bg-muted/40 px-1 py-px font-mono text-[10px]">
          ⌘S
        </kbd>{" "}
        — autosave fires within a second and lands the first commit. Every
        save adds a new checkpoint you can restore from here.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Right pane — preview + restore
// ---------------------------------------------------------------------------
function PreviewPane({
  commit,
  snapshot,
  loading,
  error,
  onRestore,
  restoring,
  hasCommits,
}: {
  commit: Commit | null;
  snapshot: NotebookSnapshot | undefined;
  loading: boolean;
  error: Error | null;
  onRestore: () => void;
  restoring: boolean;
  hasCommits: boolean;
}) {
  if (!hasCommits) {
    return (
      <section className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
        Make an edit and the preview lands here.
      </section>
    );
  }

  if (!commit) {
    return (
      <section className="flex flex-1 items-center justify-center p-10 text-center text-sm text-muted-foreground">
        Pick a commit on the left to preview it.
      </section>
    );
  }

  return (
    <section className="flex min-h-0 flex-col overflow-hidden">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-background/95 px-5 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code
              className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[10.5px]"
              title={commit.sha}
            >
              {commit.short_sha}
            </code>
            <span className="truncate text-[13px] font-semibold leading-snug">
              {commit.message}
            </span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span>{commit.author_name || "anonymous"}</span>
            <span className="text-muted-foreground/40">·</span>
            <span title={fullTime(commit.iso_timestamp)}>
              {relativeTime(commit.iso_timestamp)}
            </span>
          </div>
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={onRestore}
          disabled={restoring || loading}
          className="h-8 gap-1.5 shadow-sm shadow-primary/20"
        >
          {restoring ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RotateCcw className="h-3.5 w-3.5" />
          )}
          Restore this version
        </Button>
      </div>

      <ScrollArea className="scrollbar-thin flex-1">
        {loading ? (
          <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading snapshot…
          </div>
        ) : error ? (
          <div className="m-6 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error.message}</span>
          </div>
        ) : snapshot ? (
          <CommitPreview snapshot={snapshot} />
        ) : null}
      </ScrollArea>
    </section>
  );
}

function CommitPreview({ snapshot }: { snapshot: NotebookSnapshot }) {
  const cells = snapshot.cells ?? [];
  return (
    <div className="space-y-5 px-6 py-5">
      <header className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
          Notebook at this point
        </div>
        <h2 className="text-balance text-xl font-semibold leading-tight tracking-tightish">
          {snapshot.metadata.title || "Untitled"}
        </h2>
        <div className="text-[11px] text-muted-foreground">
          {cells.length} {cells.length === 1 ? "cell" : "cells"}
        </div>
      </header>

      <div className="space-y-3">
        {cells.length === 0 && (
          <div className="rounded-xl border bg-muted/10 p-4 text-center text-xs text-muted-foreground">
            (empty notebook)
          </div>
        )}
        {cells.map((c, i) => (
          <CellPreview key={c.id || `cell-${i}`} cell={c} index={i + 1} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-cell preview
// ---------------------------------------------------------------------------
const CELL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  markdown: FileText,
  sql: Terminal,
  ai_prompt: Bot,
  visualization: ImageIcon,
  knowledge_note: StickyNote,
};

function CellPreview({
  cell,
  index,
}: {
  cell: NotebookSnapshot["cells"][number];
  index: number;
}) {
  const Icon = CELL_ICONS[cell.cell_type] ?? FileText;
  return (
    <article className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b bg-muted/20 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <span className="grid h-4 w-4 place-items-center rounded bg-background text-[9px] font-bold tabular-nums">
          {index}
        </span>
        <Icon className="h-3 w-3 text-primary" />
        <span>{cell.cell_type.replace("_", " ")}</span>
      </header>
      <div className="px-4 py-3">
        <CellBody cell={cell} />
      </div>
    </article>
  );
}

function CellBody({ cell }: { cell: NotebookSnapshot["cells"][number] }) {
  if (cell.cell_type === "markdown") {
    const md = (cell as { source?: string }).source ?? "";
    if (!md.trim()) {
      return <EmptyLine text="(empty markdown)" />;
    }
    return (
      <div className="text-[13.5px]">
        <Markdown variant="cell">{md}</Markdown>
      </div>
    );
  }

  if (cell.cell_type === "sql") {
    const sql = (cell as { sql?: string }).sql ?? "";
    if (!sql.trim()) {
      return <EmptyLine text="(empty SQL cell)" />;
    }
    return (
      <pre className="overflow-x-auto rounded-md bg-muted/40 px-3 py-2 text-[12px] leading-relaxed">
        <code className="font-mono">{sql}</code>
      </pre>
    );
  }

  if (cell.cell_type === "ai_prompt") {
    const c = cell as { prompt?: string; response?: string | null };
    return (
      <div className="space-y-2">
        {c.prompt && (
          <div className="rounded-md border-l-2 border-primary/60 bg-muted/20 px-3 py-1.5 text-[12.5px] leading-relaxed">
            {c.prompt}
          </div>
        )}
        {c.response && (
          <div className="text-[13px]">
            <Markdown variant="compact">{c.response}</Markdown>
          </div>
        )}
        {!c.prompt && !c.response && <EmptyLine text="(empty AI cell)" />}
      </div>
    );
  }

  if (cell.cell_type === "visualization") {
    const c = cell as {
      chart_config?: { chart_type?: string; x?: string; y?: string };
    };
    const t = c.chart_config?.chart_type ?? "chart";
    const bits = [c.chart_config?.x, c.chart_config?.y].filter(Boolean);
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/10 px-3 py-2 text-[12px] text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5 text-primary" />
        <span>
          <span className="font-medium">{t}</span>
          {bits.length > 0 && <> · {bits.join(" × ")}</>}
        </span>
      </div>
    );
  }

  if (cell.cell_type === "knowledge_note") {
    const c = cell as { title?: string; body?: string };
    return (
      <div className="space-y-1">
        {c.title && (
          <div className="text-[13px] font-semibold">{c.title}</div>
        )}
        {c.body && (
          <div className="text-[12.5px]">
            <Markdown variant="compact">{c.body}</Markdown>
          </div>
        )}
        {!c.title && !c.body && <EmptyLine text="(empty note)" />}
      </div>
    );
  }

  return (
    <EmptyLine text={`(no preview for ${cell.cell_type})`} />
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="text-[12px] italic text-muted-foreground/70">{text}</div>
  );
}
