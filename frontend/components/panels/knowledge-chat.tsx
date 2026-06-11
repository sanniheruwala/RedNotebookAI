"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Kbd } from "@/components/ui/kbd";
import { api } from "@/lib/api";

type Citation = { marker: number; source_id: string; title: string };
type Message = {
  role: "user" | "assistant";
  content: string;
  provider?: string;
  citations?: Citation[];
};

export function KnowledgeChat({
  notebookId,
  sourceIds,
}: {
  notebookId: string | null;
  sourceIds?: string[];
}) {
  const [prompt, setPrompt] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);

  const ask = useMutation({
    mutationFn: (question: string) => {
      if (!notebookId) throw new Error("Select a knowledge notebook first");
      return api.knowledgeChat({
        notebook_id: notebookId,
        question,
        source_ids: sourceIds,
      });
    },
    onMutate: (question) => {
      // Show the user's message immediately; the assistant reply appears
      // as a separate "thinking" bubble until the API resolves.
      setMessages((prev) => [...prev, { role: "user", content: question }]);
    },
    onSuccess: (res) => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.answer,
          provider: res.provider,
          citations: res.citations ?? [],
        },
      ]);
    },
    onError: (err: Error, _question) => {
      // Roll back the optimistic user message so the input isn't lost
      // visually if the request failed before any work happened.
      setMessages((prev) => prev.slice(0, -1));
      toast.error(err.message);
    },
  });

  const send = (text: string) => {
    if (!text.trim() || ask.isPending) return;
    ask.mutate(text);
    setPrompt("");
  };

  return (
    <div className="flex flex-1 flex-col border-t bg-background/40">
      <div className="flex items-center gap-2 px-4 py-2.5 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <MessageSquare className="h-3 w-3" />
        Ask this notebook
      </div>

      <ScrollArea className="scrollbar-thin flex-1 px-3">
        <div className="space-y-2 pb-3">
          {messages.length === 0 && (
            <div className="rounded-xl border bg-muted/20 px-3 py-2.5 text-[11px] text-muted-foreground">
              Ground answers in the sources above. Try{" "}
              <em>&ldquo;what does our orders table look like?&rdquo;</em>
            </div>
          )}
          <AnimatePresence initial={false}>
            {messages.map((m, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className={`rounded-xl border p-2.5 text-xs ${
                  m.role === "user"
                    ? "ml-4 border-primary/30 bg-primary/5"
                    : "mr-4 bg-card"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {m.role === "assistant" && (
                    <Sparkles className="h-2.5 w-2.5 text-primary" />
                  )}
                  {m.role}
                  {m.provider && (
                    <span className="text-muted-foreground/60">
                      · {m.provider}
                    </span>
                  )}
                </div>
                <GroundedAnswer message={m} />
              </motion.div>
            ))}
            {ask.isPending && (
              <motion.div
                key="thinking"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22 }}
                className="mr-4 flex items-center gap-2 rounded-xl border bg-card px-2.5 py-2 text-xs text-muted-foreground"
              >
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
                AI is grounding your answer in the sources…
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t bg-background/60 p-3 backdrop-blur">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send(prompt);
            }
          }}
          placeholder={notebookId ? "Ask about these sources..." : "Select or create a notebook first"}
          disabled={!notebookId}
          className="resize-none rounded-xl text-xs"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="hidden items-center gap-1 text-[10px] text-muted-foreground md:flex">
            <Kbd>⌘</Kbd>
            <Kbd>↵</Kbd>
          </span>
          <Button
            size="sm"
            onClick={() => send(prompt)}
            disabled={ask.isPending || !prompt.trim() || !notebookId}
            className="h-8 gap-1.5 shadow-sm shadow-primary/20"
          >
            {ask.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Ask
          </Button>
        </div>
      </div>
    </div>
  );
}

// Render an assistant message with `[n]` citation markers replaced by
// clickable chips. The chip jumps to the cited source card via a
// scroll-into-view on the dom id the panel assigns to each source row.
// User messages still render as a plain markdown block since they
// shouldn't contain citations.
function GroundedAnswer({ message }: { message: Message }) {
  if (message.role !== "assistant" || !message.citations?.length) {
    return <Markdown variant="compact">{message.content}</Markdown>;
  }
  const map = new Map(message.citations.map((c) => [c.marker, c]));
  // Replace each [n] in the text with a sentinel placeholder we can split
  // on later, so the markdown renderer doesn't try to interpret the chip.
  const parts: Array<{ type: "text" | "cite"; value: string; citation?: Citation }> = [];
  const re = /\[(\d{1,3})\]/g;
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(message.content)) !== null) {
    if (m.index > lastIndex) {
      parts.push({ type: "text", value: message.content.slice(lastIndex, m.index) });
    }
    const n = Number(m[1]);
    const citation = map.get(n);
    if (citation) {
      parts.push({ type: "cite", value: m[0], citation });
    } else {
      // Marker without a matching citation — keep the original text so we
      // don't silently swallow the model's output.
      parts.push({ type: "text", value: m[0] });
    }
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < message.content.length) {
    parts.push({ type: "text", value: message.content.slice(lastIndex) });
  }

  return (
    <div className="space-y-2">
      <div className="leading-relaxed">
        {parts.map((p, i) =>
          p.type === "text" ? (
            <span key={i}>
              <Markdown variant="compact">{p.value}</Markdown>
            </span>
          ) : (
            <CitationChip key={i} citation={p.citation!} />
          ),
        )}
      </div>
      <div className="flex flex-wrap gap-1 border-t pt-1.5">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          Cited
        </span>
        {message.citations.map((c) => (
          <CitationChip key={c.marker} citation={c} verbose />
        ))}
      </div>
    </div>
  );
}

function CitationChip({
  citation,
  verbose = false,
}: {
  citation: Citation;
  verbose?: boolean;
}) {
  const onClick = () => {
    const el = document.getElementById(`knowledge-source-${citation.source_id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      el.classList.add("ring-2", "ring-primary", "ring-offset-1");
      setTimeout(
        () => el.classList.remove("ring-2", "ring-primary", "ring-offset-1"),
        1500,
      );
    }
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={citation.title}
      className="inline-flex items-center gap-0.5 rounded-md border border-primary/30 bg-primary/10 px-1 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/20"
    >
      [{citation.marker}]
      {verbose && (
        <span className="ml-0.5 max-w-[14ch] truncate font-normal text-foreground/80">
          {citation.title}
        </span>
      )}
    </button>
  );
}
