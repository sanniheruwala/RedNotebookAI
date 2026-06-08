"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  Database,
  FileCode,
  FileText,
  Image as ImageIcon,
  Loader2,
  RefreshCcw,
  Sparkles,
  Table2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/markdown";
import {
  useActiveCellResults,
  useActiveNotebook,
} from "@/store/notebook-store";
import { useNotebookKnowledge } from "@/hooks/use-notebook-knowledge";
import { api, HttpError } from "@/lib/api";
import type { InfographicBrief, KnowledgeSource } from "@/lib/types";

type InfographicAttachment = {
  image: string;
  brief: InfographicBrief;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  infographic?: InfographicAttachment;
};

const SOURCE_TYPE_ICONS: Record<string, React.ReactNode> = {
  sql_query: <FileCode className="h-3 w-3 text-muted-foreground" />,
  query_result: <Table2 className="h-3 w-3 text-muted-foreground" />,
  schema: <Database className="h-3 w-3 text-muted-foreground" />,
  markdown: <FileText className="h-3 w-3 text-muted-foreground" />,
};

function sourceTypeIcon(t: string) {
  return SOURCE_TYPE_ICONS[t] ?? <FileText className="h-3 w-3 text-muted-foreground" />;
}

/**
 * Per-notebook knowledge surface: source list, AI chat grounded in those
 * sources, and the inline infographic generator. Rendered inside the
 * right-edge drawer (see knowledge-drawer.tsx). Auto-binds to the active
 * notebook so the user never has to pick from a dropdown.
 */
export function NotebookKnowledgeBody() {
  const notebook = useActiveNotebook();
  const cellResults = useActiveCellResults();
  const { knowledgeNotebookId, ensure } = useNotebookKnowledge(
    notebook.id,
    notebook.metadata.title,
  );
  const qc = useQueryClient();
  const [prompt, setPrompt] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [sourcesOpen, setSourcesOpen] = React.useState(true);

  const sourcesQ = useQuery({
    queryKey: ["knowledge-sources", knowledgeNotebookId],
    queryFn: () =>
      knowledgeNotebookId
        ? api.listKnowledgeSources(knowledgeNotebookId)
        : Promise.resolve({ sources: [] }),
    enabled: !!knowledgeNotebookId,
  });

  const sources = sourcesQ.data?.sources ?? [];
  const sourceCount = sources.length;

  // Sync a quick set of "what's in this notebook right now" so users can
  // chat against their cells without manually saving each one.
  const syncFromNotebook = useMutation({
    mutationFn: async () => {
      const id = await ensure();
      const existingTitles = new Set(sources.map((s) => `${s.source_type}::${s.title}`));
      let added = 0;
      for (let i = 0; i < notebook.cells.length; i++) {
        const cell = notebook.cells[i];
        if (cell.cell_type === "sql" && cell.sql.trim()) {
          const title = `SQL · cell ${i + 1}`;
          if (!existingTitles.has(`sql_query::${title}`)) {
            await api.addKnowledgeSource({
              notebook_id: id,
              source_type: "sql_query",
              title,
              content: cell.sql,
            });
            added++;
          }
          const result = cellResults[cell.id]?.result;
          if (result) {
            const resTitle = `Result · cell ${i + 1}`;
            if (!existingTitles.has(`query_result::${resTitle}`)) {
              await api.addKnowledgeSource({
                notebook_id: id,
                source_type: "query_result",
                title: resTitle,
                content: result.sql ?? cell.sql,
                metadata: {
                  row_count: result.row_count,
                  column_count: result.columns.length,
                  columns: result.columns.map((c) => ({
                    name: c.name,
                    data_type: c.data_type,
                  })),
                  truncated: result.truncated,
                  sample_rows: result.rows.slice(0, 5),
                },
              });
              added++;
            }
          }
        } else if (cell.cell_type === "markdown" && cell.source.trim()) {
          const title = `Note · cell ${i + 1}`;
          if (!existingTitles.has(`markdown::${title}`)) {
            await api.addKnowledgeSource({
              notebook_id: id,
              source_type: "markdown",
              title,
              content: cell.source,
            });
            added++;
          }
        }
      }
      return added;
    },
    onSuccess: (added) => {
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      if (added > 0) toast.success(`Synced ${added} source${added === 1 ? "" : "s"}`);
      else toast("Nothing new to sync — sources are up to date.");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteSource = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!knowledgeNotebookId) return;
      await api.deleteKnowledgeSource(knowledgeNotebookId, sourceId);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const id = await ensure();
      return api.knowledgeChat({
        notebook_id: id,
        question,
        // Empty array → backend defaults to ALL sources; only constrain
        // when the user has explicitly picked a subset.
        source_ids:
          selectedSourceIds.size > 0 ? Array.from(selectedSourceIds) : undefined,
      });
    },
    onMutate: (question) => {
      // Optimistically render the user's message so the thinking bubble
      // has something to sit under while the API is in flight.
      setMessages((prev) => [...prev, { role: "user", content: question }]);
    },
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.answer },
      ]);
    },
    onError: (err: Error) => {
      setMessages((prev) => prev.slice(0, -1));
      toast.error(err instanceof HttpError ? err.message : err.message);
    },
  });

  const infographicToastId = "knowledge-infographic";
  const generateInfographic = useMutation({
    mutationFn: async () => {
      const id = await ensure();
      // Use the most recent SQL cell's result as the data source when
      // available so the brief reflects real numbers; otherwise let the
      // backend draft from the knowledge sources alone.
      const latestResult = (() => {
        for (let i = notebook.cells.length - 1; i >= 0; i--) {
          const c = notebook.cells[i];
          if (c.cell_type === "sql") {
            const r = cellResults[c.id]?.result;
            if (r) return { cell: c, result: r };
          }
        }
        return null;
      })();
      return api.generateInfographic({
        notebook_id: id,
        template: "executive_kpi_brief",
        title_hint: notebook.metadata.title,
        sql: latestResult?.cell.cell_type === "sql" ? latestResult.cell.sql : null,
        columns: latestResult?.result.columns ?? [],
        sample_rows: latestResult?.result.rows.slice(0, 30) ?? [],
        aggregated_stats: {},
        persist: true,
      });
    },
    onMutate: () => {
      toast.loading("AI is drafting your infographic…", {
        id: infographicToastId,
      });
      // Drop a placeholder thinking bubble in the chat so users can see
      // the work happening in-context without a popup.
      setMessages((prev) => [
        ...prev,
        {
          role: "user",
          content: "Generate an infographic from the latest analysis.",
        },
      ]);
    },
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.brief.summary || res.brief.title || "Infographic ready.",
          infographic: { image: res.image, brief: res.brief },
        },
      ]);
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
      toast.success("Infographic ready", { id: infographicToastId });
    },
    onError: (err: Error) => {
      setMessages((prev) => prev.slice(0, -1));
      toast.error(err.message, { id: infographicToastId });
    },
  });

  const send = (text: string) => {
    if (!text.trim()) return;
    ask.mutate(text);
    setPrompt("");
  };

  const toggleSource = (id: string) =>
    setSelectedSourceIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectAll = () =>
    setSelectedSourceIds(new Set(sources.map((s) => s.id)));
  const clearSelection = () => setSelectedSourceIds(new Set());

  return (
    <div className="flex h-full min-w-0 flex-col">
      {/* Sources */}
      <section className="border-b">
        <button
          onClick={() => setSourcesOpen((o) => !o)}
          className="flex w-full items-center justify-between px-4 pt-3 pb-2 text-left"
        >
          <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <ChevronDown
              className={`h-3 w-3 transition-transform ${
                sourcesOpen ? "" : "-rotate-90"
              }`}
            />
            Sources
          </div>
          <div className="flex items-center gap-1.5">
            {selectedSourceIds.size > 0 && (
              <Badge variant="outline" className="h-5 rounded-md text-[10px]">
                {selectedSourceIds.size} selected
              </Badge>
            )}
            <Badge variant="outline" className="h-5 rounded-md text-[10px]">
              {knowledgeNotebookId ? `${sourceCount}` : "—"}
            </Badge>
          </div>
        </button>
        {sourcesOpen && (
          <div className="px-4 pb-3">
            <div className="mb-2 flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 flex-1 gap-1.5 text-[11px]"
                onClick={() => syncFromNotebook.mutate()}
                disabled={syncFromNotebook.isPending}
              >
                {syncFromNotebook.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCcw className="h-3 w-3" />
                )}
                Sync from notebook
              </Button>
              {sourceCount > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[10px]"
                  onClick={
                    selectedSourceIds.size === sourceCount
                      ? clearSelection
                      : selectAll
                  }
                >
                  {selectedSourceIds.size === sourceCount ? "Clear" : "All"}
                </Button>
              )}
            </div>
            {sourceCount === 0 ? (
              <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
                No sources yet. Click <strong>Sync from notebook</strong> to
                capture every SQL cell, its result, and any markdown notes as
                grounded context.
              </div>
            ) : (
              <ScrollArea className="max-h-44">
                <div className="space-y-1 pr-1">
                  {sources.map((src) => (
                    <SourceRow
                      key={src.id}
                      src={src}
                      selected={selectedSourceIds.has(src.id)}
                      onToggle={() => toggleSource(src.id)}
                      onDelete={() => deleteSource.mutate(src.id)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
            <Button
              size="sm"
              className="mt-2 w-full gap-1.5 shadow-sm shadow-primary/20"
              onClick={() => generateInfographic.mutate()}
              disabled={generateInfographic.isPending}
            >
              {generateInfographic.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
              Generate infographic
            </Button>
          </div>
        )}
      </section>

      {/* Chat */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Ask this notebook
          </div>
          {selectedSourceIds.size > 0 && (
            <span className="text-[10px] text-muted-foreground">
              Grounded in {selectedSourceIds.size} source
              {selectedSourceIds.size === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <ScrollArea className="min-w-0 flex-1 px-4 py-2">
          <div className="space-y-2">
            {messages.length === 0 && !ask.isPending && !generateInfographic.isPending ? (
              <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-[11px] text-muted-foreground">
                Try <em>&ldquo;what does the schema look like?&rdquo;</em> once
                you&apos;ve added a source — or hit{" "}
                <strong>Generate infographic</strong> for a designed image
                inline.
              </div>
            ) : (
              <>
                {messages.map((m, i) => (
                  <ChatBubble key={i} message={m} />
                ))}
                {(ask.isPending || generateInfographic.isPending) && (
                  <div className="mr-3 flex items-center gap-2 rounded-md border bg-card px-2 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    {generateInfographic.isPending
                      ? "AI is designing your infographic…"
                      : "AI is grounding your answer in the sources…"}
                  </div>
                )}
              </>
            )}
          </div>
        </ScrollArea>
        <div className="border-t bg-muted/20 p-3">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                send(prompt);
              }
            }}
            rows={2}
            placeholder={
              sourceCount === 0
                ? "Sync notebook sources, then ask grounded questions…"
                : "Ask grounded in your sources…"
            }
            className="resize-none rounded-md text-xs"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <span className="hidden items-center gap-1 text-[10px] text-muted-foreground md:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </span>
            <Button
              size="sm"
              onClick={() => send(prompt)}
              disabled={ask.isPending || !prompt.trim()}
              className="h-7 gap-1.5"
            >
              {ask.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Ask
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  return (
    <div
      className={`rounded-md border p-2 text-xs ${
        message.role === "user"
          ? "ml-3 border-primary/30 bg-primary/5"
          : "mr-3 bg-card"
      }`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {message.role === "assistant" && (
          <Sparkles className="h-2.5 w-2.5 text-primary" />
        )}
        {message.role}
      </div>
      {message.infographic ? (
        <InfographicAttachmentView attachment={message.infographic} />
      ) : (
        <Markdown variant="compact">{message.content}</Markdown>
      )}
    </div>
  );
}

function InfographicAttachmentView({
  attachment,
}: {
  attachment: InfographicAttachment;
}) {
  const downloadSvg = () => {
    // Image is a data URL — split off the base64 payload and re-blob it
    // so the user gets a clean .svg file rather than a giant data URI.
    const match = attachment.image.match(/^data:([^;]+);base64,(.+)$/);
    const mime = match?.[1] ?? "image/svg+xml";
    const bytes = match
      ? Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))
      : new TextEncoder().encode(attachment.image);
    const blob = new Blob([bytes], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(attachment.brief.title || "infographic")
      .toLowerCase()
      .replace(/\s+/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2">
      <div className="overflow-hidden rounded-lg border bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={attachment.image}
          alt={attachment.brief.title}
          className="block h-auto w-full"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[10px] text-muted-foreground">
          {attachment.brief.title}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-[10px]"
          onClick={downloadSvg}
        >
          Download SVG
        </Button>
      </div>
    </div>
  );
}

function SourceRow({
  src,
  selected,
  onToggle,
  onDelete,
}: {
  src: KnowledgeSource;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`group/src flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors ${
        selected ? "border-primary/40 bg-primary/5" : "border-border bg-card"
      }`}
    >
      <button
        onClick={onToggle}
        aria-label={selected ? "Deselect source" : "Select source"}
        className={`grid h-4 w-4 shrink-0 place-items-center rounded border ${
          selected ? "border-primary bg-primary text-white" : "border-border bg-background"
        }`}
      >
        {selected && <Check className="h-3 w-3" />}
      </button>
      {sourceTypeIcon(src.source_type)}
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium" title={src.title}>
        {src.title}
      </span>
      <Badge variant="outline" className="shrink-0 text-[9px] uppercase tracking-widest">
        {src.source_type.replace(/_/g, " ")}
      </Badge>
      <button
        onClick={onDelete}
        aria-label="Remove source"
        className="opacity-0 transition-opacity group-hover/src:opacity-100"
      >
        <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}
