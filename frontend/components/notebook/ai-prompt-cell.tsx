"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Loader2, Send, Sparkles, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import { useNotebookStore } from "@/store/notebook-store";
import { api } from "@/lib/api";
import type {
  AIChatMessage,
  AIPromptCell as AIPromptCellType,
} from "@/lib/types";

/**
 * Multi-turn AI prompt cell. Each cell maintains its own conversation thread
 * inside the notebook — refine the question, then promote any assistant
 * reply to a real SQL cell with one click.
 *
 * The legacy `prompt` / `response` / `suggested_sql` fields are still
 * persisted for backward compatibility with v0.4.x notebooks, but new
 * activity flows through `messages`.
 */
export function AIPromptCell({ cell }: { cell: AIPromptCellType }) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const removeCell = useNotebookStore((s) => s.removeCell);
  const addCell = useNotebookStore((s) => s.addCell);

  const messages = React.useMemo<AIChatMessage[]>(() => {
    if (cell.messages && cell.messages.length > 0) return cell.messages;
    // Backfill: surface a pre-existing one-shot exchange as a 2-message thread.
    if (cell.prompt && cell.suggested_sql) {
      return [
        { role: "user", content: cell.prompt },
        {
          role: "assistant",
          content: cell.suggested_sql,
          suggested_sql: cell.suggested_sql,
        },
      ];
    }
    return [];
  }, [cell.messages, cell.prompt, cell.suggested_sql]);

  const [draft, setDraft] = React.useState(cell.prompt ?? "");

  const setMessages = (next: AIChatMessage[]) => {
    updateCell(cell.id, (c) =>
      c.cell_type === "ai_prompt" ? { ...c, messages: next, prompt: "" } : c
    );
  };

  const ask = useMutation({
    mutationFn: (question: string) =>
      api.aiGenerateSQL({ prompt: question, context: { history: messages } }),
    onMutate: (question) => {
      setMessages([...messages, { role: "user", content: question }]);
      setDraft("");
    },
    onSuccess: (res) => {
      setMessages([
        ...messages,
        { role: "user", content: lastUser(messages, draft) },
        {
          role: "assistant",
          content: res.sql,
          suggested_sql: res.sql,
          provider: res.provider,
        },
      ]);
    },
    onError: (err: Error) => {
      // Roll back the optimistic user message
      setMessages(messages);
      toast.error(err.message);
    },
  });

  const accept = (sql: string) => {
    const id = addCell("sql", cell.id);
    updateCell(id, (c) =>
      c.cell_type === "sql" ? { ...c, sql } : c
    );
    toast.success("Inserted SQL cell");
  };

  const send = () => {
    const q = draft.trim();
    if (!q || ask.isPending) return;
    ask.mutate(q);
  };

  return (
    <div className="card-premium group/cell relative overflow-hidden p-4">
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative">
        <div className="mb-3 flex items-center justify-between">
          <Badge
            variant="outline"
            className="h-5 gap-1.5 rounded-md border-primary/30 bg-primary/10 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
          >
            <Sparkles className="h-2.5 w-2.5" /> Ask AI
          </Badge>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <span className="text-[10px] text-muted-foreground">
                {messages.filter((m) => m.role === "user").length} turn
                {messages.filter((m) => m.role === "user").length === 1
                  ? ""
                  : "s"}
              </span>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground opacity-0 hover:text-destructive group-hover/cell:opacity-100"
              onClick={() => removeCell(cell.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {messages.length > 0 && (
          <div className="mb-3 space-y-2">
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <ChatBubble message={m} onInsert={accept} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
              e.preventDefault();
              send();
            }
          }}
          rows={messages.length > 0 ? 2 : 3}
          placeholder={
            messages.length > 0
              ? "Refine the query, ask a follow-up, or pivot…"
              : "Ask in plain English, e.g. “top 10 customers by revenue this quarter”"
          }
          className="resize-y border-none bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="hidden items-center gap-1 text-[10px] text-muted-foreground md:flex">
            <Kbd>⇧</Kbd>
            <Kbd>↵</Kbd>
            <span className="ml-1">to send</span>
          </span>
          <Button
            size="sm"
            onClick={send}
            disabled={ask.isPending || !draft.trim()}
            className="gap-1.5 shadow-sm shadow-primary/25"
          >
            {ask.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {messages.length > 0 ? "Send" : "Generate SQL"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function lastUser(prev: AIChatMessage[], _fallback: string): string {
  // Returns the most recent user message — used when reconciling state after
  // the optimistic onMutate fired before the API resolved.
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === "user") return prev[i].content;
  }
  return prev[prev.length - 1]?.content ?? "";
}

function ChatBubble({
  message,
  onInsert,
}: {
  message: AIChatMessage;
  onInsert: (sql: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div
      className={`flex items-start gap-2 ${
        isUser ? "flex-row-reverse" : "flex-row"
      }`}
    >
      <div
        className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md ${
          isUser
            ? "bg-muted text-muted-foreground"
            : "bg-primary/15 text-primary ring-1 ring-primary/30"
        }`}
      >
        {isUser ? (
          <User className="h-3 w-3" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
      </div>
      <div
        className={`min-w-0 max-w-[85%] rounded-lg border p-2.5 text-xs ${
          isUser ? "border-border bg-muted/40" : "border-border/60 bg-card"
        }`}
      >
        {message.suggested_sql ? (
          <div className="space-y-2">
            <pre className="max-h-56 overflow-auto rounded-md bg-muted/40 p-2">
              <code className="font-mono text-[11px]">
                {message.suggested_sql}
              </code>
            </pre>
            <div className="flex items-center justify-between">
              {message.provider && (
                <span className="text-[10px] text-muted-foreground">
                  via {message.provider}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => onInsert(message.suggested_sql ?? "")}
                className="ml-auto h-6 gap-1.5 text-[11px]"
              >
                Insert as SQL <ArrowRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </div>
        )}
      </div>
    </div>
  );
}
