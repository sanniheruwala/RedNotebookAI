"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import {
  BookMarked,
  ChevronDown,
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/markdown";
import { InfographicModal } from "@/components/panels/infographic-modal";
import { useActiveNotebook } from "@/store/notebook-store";
import { useNotebookKnowledge } from "@/hooks/use-notebook-knowledge";
import { api, HttpError } from "@/lib/api";
import type { InfographicBrief, KnowledgeSource } from "@/lib/types";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Per-notebook knowledge surface. Auto-bound to the active notebook so the
 * user never has to pick from a dropdown. Collapsible footer that hosts the
 * sources list, AI chat over those sources, and the infographic generator.
 */
export function NotebookKnowledge() {
  const notebook = useActiveNotebook();
  const { knowledgeNotebookId, ensure } = useNotebookKnowledge(
    notebook.id,
    notebook.metadata.title
  );
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(true);
  const [prompt, setPrompt] = React.useState("");
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [infographic, setInfographic] = React.useState<{
    brief: InfographicBrief;
    html: string;
  } | null>(null);

  const sources = useQuery({
    queryKey: ["knowledge-sources", knowledgeNotebookId],
    queryFn: () =>
      knowledgeNotebookId
        ? api.listKnowledgeSources(knowledgeNotebookId)
        : Promise.resolve({ sources: [] }),
    enabled: !!knowledgeNotebookId && open,
  });

  const ask = useMutation({
    mutationFn: async (question: string) => {
      const id = await ensure();
      return api.knowledgeChat({ notebook_id: id, question });
    },
    onSuccess: (res, question) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: res.answer },
      ]);
    },
    onError: (err: Error) =>
      toast.error(err instanceof HttpError ? err.message : err.message),
  });

  const generateInfographic = useMutation({
    mutationFn: async () => {
      const id = await ensure();
      return api.generateInfographic({
        notebook_id: id,
        template: "executive_kpi_brief",
        title_hint: notebook.metadata.title,
        columns: [],
        sample_rows: [],
        aggregated_stats: {},
        persist: true,
      });
    },
    onSuccess: (res) => {
      setInfographic({ brief: res.brief, html: res.html });
      qc.invalidateQueries({ queryKey: ["knowledge-sources"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const sourceCount = sources.data?.sources.length ?? 0;
  const send = (text: string) => {
    if (!text.trim()) return;
    ask.mutate(text);
    setPrompt("");
  };

  return (
    <motion.section
      layout
      className="card-premium mt-4 overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 border-b border-border/60 bg-muted/30 px-3 py-2 text-left transition-colors hover:bg-muted/50"
      >
        <BookMarked className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold tracking-tightish">Knowledge</span>
        <Badge variant="outline" className="h-5 rounded-md text-[10px]">
          {knowledgeNotebookId ? `${sourceCount} sources` : "Not started"}
        </Badge>
        <span className="ml-auto text-[10px] text-muted-foreground">
          AI chat &amp; infographic for this notebook
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${
            open ? "" : "-rotate-90"
          }`}
        />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid gap-4 p-4 md:grid-cols-2">
              {/* Sources */}
              <div className="space-y-2">
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Sources
                </div>
                {sourceCount === 0 ? (
                  <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-xs text-muted-foreground">
                    Add SQL, schemas, or chart explanations from any cell into
                    this knowledge surface to build up reference material the
                    AI can ground its answers on.
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {(sources.data?.sources ?? []).map((src) => (
                      <SourceRow key={src.id} src={src} />
                    ))}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full gap-1.5"
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

              {/* Chat */}
              <div className="flex flex-col gap-2">
                <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Ask this notebook
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto rounded-lg border bg-muted/10 p-2.5 min-h-[140px] max-h-[260px]">
                  {messages.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground">
                      Try <em>&ldquo;what does the schema look like?&rdquo;</em> once
                      you&apos;ve added a source.
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div
                        key={i}
                        className={`rounded-md border p-2 text-xs ${
                          m.role === "user"
                            ? "ml-3 border-primary/30 bg-primary/5"
                            : "mr-3 bg-card"
                        }`}
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                          {m.role === "assistant" && (
                            <Sparkles className="h-2.5 w-2.5 text-primary" />
                          )}
                          {m.role}
                        </div>
                        <Markdown variant="compact">{m.content}</Markdown>
                      </div>
                    ))
                  )}
                </div>
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
                  placeholder="Ask grounded in your sources..."
                  className="resize-none rounded-md text-xs"
                />
                <div className="flex items-center justify-end gap-2">
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <InfographicModal
        open={!!infographic}
        onOpenChange={(o) => !o && setInfographic(null)}
        brief={infographic?.brief ?? null}
        template="executive_kpi_brief"
        rawHtml={infographic?.html}
      />
    </motion.section>
  );
}

function SourceRow({ src }: { src: KnowledgeSource }) {
  return (
    <div className="rounded-md border bg-card px-2.5 py-1.5">
      <div className="flex items-center gap-2 text-xs">
        <FileText className="h-3 w-3 text-muted-foreground" />
        <span className="truncate font-medium">{src.title}</span>
        <Badge variant="outline" className="ml-auto text-[10px]">
          {src.source_type}
        </Badge>
      </div>
    </div>
  );
}
