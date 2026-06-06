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

type Message = { role: "user" | "assistant"; content: string; provider?: string };

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
    onSuccess: (res, question) => {
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: res.answer, provider: res.provider },
      ]);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const send = (text: string) => {
    if (!text.trim()) return;
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
