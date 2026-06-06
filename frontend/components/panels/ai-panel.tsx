"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Kbd } from "@/components/ui/kbd";
import { Markdown } from "@/components/markdown";
import { api } from "@/lib/api";
import { useNotebookStore } from "@/store/notebook-store";

type Message = { role: "user" | "assistant"; content: string };

const STARTER_PROMPTS = [
  "Show top 10 customers by revenue this quarter",
  "Daily active users for the last 30 days",
  "Highest-impact funnel drop-offs in onboarding",
  "Cost per acquisition by channel, weekly",
];

export function AIPanel() {
  const [prompt, setPrompt] = React.useState("");
  const [messages, setMessages] = React.useState<Message[]>([]);
  const addCell = useNotebookStore((s) => s.addCell);
  const updateCell = useNotebookStore((s) => s.updateCell);

  const ask = useMutation({
    mutationFn: (text: string) => api.aiGenerateSQL({ prompt: text, context: {} }),
    onSuccess: (res, text) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "```sql\n" + res.sql + "\n```" },
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const insertLastIntoNotebook = () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    const sql = last.content.replace(/^```sql\n?|\n?```$/g, "");
    const id = addCell("sql");
    updateCell(id, (c) => (c.cell_type === "sql" ? { ...c, sql } : c));
    toast.success("Inserted SQL cell");
  };

  const send = (text: string) => {
    if (!text.trim()) return;
    ask.mutate(text);
    setPrompt("");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tightish">AI Assistant</div>
          <div className="text-[11px] leading-tight text-muted-foreground">
            Generate SQL · explain results · suggest charts
          </div>
        </div>
      </div>

      <ScrollArea className="scrollbar-thin flex-1 px-4">
        <div className="space-y-3 py-3">
          {messages.length === 0 && (
            <div className="space-y-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Try a starter
              </div>
              <div className="flex flex-wrap gap-1.5">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    className="group/chip rounded-full border bg-muted/30 px-2.5 py-1 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((m, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22 }}
                className={`rounded-xl border p-3 text-xs ${
                  m.role === "user"
                    ? "ml-6 border-primary/30 bg-primary/5"
                    : "mr-6 bg-card"
                }`}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  {m.role === "assistant" && <Sparkles className="h-2.5 w-2.5 text-primary" />}
                  {m.role}
                </div>
                <Markdown variant="compact">{m.content}</Markdown>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      <div className="space-y-2 border-t bg-background/60 p-3 backdrop-blur">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send(prompt);
            }
          }}
          placeholder="Ask anything about your data…"
          className="resize-none rounded-xl"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={insertLastIntoNotebook}
            disabled={!messages.length}
            className="h-8 gap-1.5 text-xs"
          >
            Insert into notebook
          </Button>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1 text-[10px] text-muted-foreground md:flex">
              <Kbd>⌘</Kbd>
              <Kbd>↵</Kbd>
            </span>
            <Button
              size="sm"
              onClick={() => send(prompt)}
              disabled={ask.isPending || !prompt.trim()}
              className="h-8 gap-1.5 shadow-sm shadow-primary/20"
            >
              {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
