"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Share2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useActiveCellResults, useNotebookStore } from "@/store/notebook-store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function absoluteUrl(relative: string): string {
  if (typeof window === "undefined") return relative;
  if (relative.startsWith("http")) return relative;
  return `${window.location.origin}${relative}`;
}

export function PublishDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const notebook = useNotebookStore((s) =>
    s.activeTab ? s.notebooks[s.activeTab] : null,
  );
  const cellResults = useActiveCellResults();
  const notebookId = notebook?.id ?? null;
  const isReal = !!notebookId && notebookId !== "empty";

  const live = useQuery({
    queryKey: ["published", notebookId],
    queryFn: () =>
      notebookId
        ? api.listPublishedForNotebook(notebookId)
        : Promise.resolve({ records: [] }),
    enabled: open && isReal,
    staleTime: 0,
  });

  // Snapshot every SQL cell result currently in the zustand store so the
  // published page captures what the user actually sees, not whatever the
  // live source returns when the page is later viewed.
  const snapshotResults = React.useCallback(() => {
    const out: Record<
      string,
      {
        columns: { name: string; data_type: string }[];
        rows: Record<string, unknown>[];
        row_count: number;
        duration_seconds: number;
      }
    > = {};
    for (const [cellId, payload] of Object.entries(cellResults)) {
      const r = payload?.result;
      if (!r) continue;
      out[cellId] = {
        columns: r.columns.map((c) => ({ name: c.name, data_type: c.data_type })),
        rows: r.rows,
        row_count: r.row_count,
        duration_seconds: r.duration_seconds,
      };
    }
    return out;
  }, [cellResults]);

  const publish = useMutation({
    mutationFn: () => {
      if (!notebookId) throw new Error("Open a notebook first");
      return api.publishNotebook(notebookId, snapshotResults());
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["published", notebookId] });
      toast.success("Notebook published — share link ready");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const revoke = useMutation({
    mutationFn: (token: string) => {
      if (!notebookId) throw new Error("Open a notebook first");
      return api.revokePublished(notebookId, token);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["published", notebookId] });
      toast.success("Share link revoked");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const records = live.data?.records ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Publish notebook</DialogTitle>
        <DialogDescription className="sr-only">
          Mint a public share link that anyone can view without an account.
        </DialogDescription>

        <div className="flex items-start justify-between border-b bg-background/80 px-5 py-3 backdrop-blur-md">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
              <Globe2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tightish">
                Publish notebook
              </div>
              <div className="text-[11px] text-muted-foreground">
                Anyone with the link sees the notebook + current result
                snapshots. No account required.
              </div>
            </div>
          </div>
          {/* No explicit Close — DialogContent's built-in DialogPrimitive.Close
              renders the top-right X. */}
        </div>

        {!isReal ? (
          <div className="p-6 text-sm text-muted-foreground">
            Open a notebook first.
          </div>
        ) : (
          <div className="space-y-4 p-5">
            <Button
              onClick={() => publish.mutate()}
              disabled={publish.isPending}
              className="w-full gap-2 shadow-sm shadow-primary/20"
            >
              {publish.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              {publish.isPending ? "Rendering snapshot…" : "Publish current state"}
            </Button>

            <div>
              <div className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                <span>Live share links</span>
                <span className="tabular-nums text-muted-foreground/70">
                  {records.length}
                </span>
              </div>
              <ScrollArea className="scrollbar-thin max-h-72">
                {live.isPending ? (
                  <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
                  </div>
                ) : records.length === 0 ? (
                  <div className="rounded-lg border bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
                    No live share links yet. Click <strong>Publish</strong>{" "}
                    above to mint one.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {records.map((r) => (
                      <ShareLinkRow
                        key={r.token}
                        url={absoluteUrl(r.url)}
                        createdAt={r.created_at}
                        onRevoke={() => revoke.mutate(r.token)}
                        disabled={revoke.isPending}
                      />
                    ))}
                  </ul>
                )}
              </ScrollArea>
            </div>

            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Each publish mints a new link. Older links keep working until
              you revoke them. <code>X-Robots-Tag: noindex</code> is set so
              accidental shares don&apos;t show up in search.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ShareLinkRow({
  url,
  createdAt,
  onRevoke,
  disabled,
}: {
  url: string;
  createdAt: string;
  onRevoke: () => void;
  disabled: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      // Fallback for browsers that block clipboard outside of HTTPS.
      const sel = document.createElement("input");
      sel.value = url;
      document.body.appendChild(sel);
      sel.select();
      document.execCommand("copy");
      document.body.removeChild(sel);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    }
  };

  return (
    <li className="rounded-lg border bg-card p-2.5">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={url}
          className="h-8 flex-1 font-mono text-[11px]"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          onClick={copy}
          aria-label="Copy share URL"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Open share URL"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
        <Button
          size="icon"
          variant="ghost"
          onClick={onRevoke}
          disabled={disabled}
          aria-label="Revoke share URL"
          className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="mt-1 px-1 text-[10px] text-muted-foreground">
        published {new Date(createdAt).toLocaleString()}
      </div>
    </li>
  );
}
