"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  FileText,
  Image as ImageIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Kbd } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Markdown } from "@/components/markdown";
import { InfographicModal } from "@/components/panels/infographic-modal";
import { useActiveNotebook } from "@/store/notebook-store";
import { useNotebookKnowledge } from "@/hooks/use-notebook-knowledge";
import { api, HttpError } from "@/lib/api";
import type { InfographicBrief, KnowledgeSource } from "@/lib/types";

type ChatMessage = { role: "user" | "assistant"; content: string };

/**
 * Per-notebook knowledge surface: source list, AI chat grounded in those
 * sources, and the infographic generator. Rendered inside the right-edge
 * drawer (see knowledge-drawer.tsx). Auto-binds to the active notebook so
 * the user never has to pick from a dropdown.
 */
export function NotebookKnowledgeBody() {
  const notebook = useActiveNotebook();
  const { knowledgeNotebookId, ensure } = useNotebookKnowledge(
    notebook.id,
    notebook.metadata.title
  );
  const qc = useQueryClient();
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
    enabled: !!knowledgeNotebookId,
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
    <div className="flex h-full flex-col">
      {/* Sources */}
      <section className="border-b">
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Sources
          </div>
          <Badge variant="outline" className="h-5 rounded-md text-[10px]">
            {knowledgeNotebookId ? `${sourceCount}` : "—"}
          </Badge>
        </div>
        <div className="px-4 py-3">
          {sourceCount === 0 ? (
            <div className="rounded-lg border border-dashed bg-muted/20 px-3 py-3 text-[11px] leading-relaxed text-muted-foreground">
              Add SQL, schemas, or chart explanations from any cell to build up
              reference material the AI can ground its answers on.
            </div>
          ) : (
            <ScrollArea className="max-h-40">
              <div className="space-y-1.5 pr-1">
                {(sources.data?.sources ?? []).map((src) => (
                  <SourceRow key={src.id} src={src} />
                ))}
              </div>
            </ScrollArea>
          )}
          <Button
            size="sm"
            variant="outline"
            className="mt-2 w-full gap-1.5"
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
      </section>

      {/* Chat */}
      <section className="flex min-h-0 flex-1 flex-col">
        <div className="px-4 pt-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Ask this notebook
        </div>
        <ScrollArea className="flex-1 px-4 py-2">
          <div className="space-y-2">
            {messages.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/10 px-3 py-3 text-[11px] text-muted-foreground">
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
            placeholder="Ask grounded in your sources..."
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

      <InfographicModal
        open={!!infographic}
        onOpenChange={(o) => !o && setInfographic(null)}
        brief={infographic?.brief ?? null}
        template="executive_kpi_brief"
        rawHtml={infographic?.html}
      />
    </div>
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
