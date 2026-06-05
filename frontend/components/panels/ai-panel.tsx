"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import { useNotebookStore } from "@/store/notebook-store";

type Message = { role: "user" | "assistant"; content: string };

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

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Sparkles className="h-4 w-4 text-primary" />
        <div>
          <div className="text-sm font-semibold">AI Assistant</div>
          <div className="text-[11px] text-muted-foreground">Generate SQL, explain results, suggest charts</div>
        </div>
      </div>
      <ScrollArea className="scrollbar-thin flex-1 px-4">
        <div className="space-y-3 py-3">
          {messages.length === 0 && (
            <div className="rounded-xl border bg-muted/20 p-4 text-xs text-muted-foreground">
              Ask in plain English — e.g. <em>“top 10 customers by revenue this quarter”</em>.
            </div>
          )}
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`rounded-xl border p-3 text-xs ${
                m.role === "user" ? "bg-muted/30" : "bg-card"
              }`}
            >
              <div className="mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                {m.role}
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="border-t p-3 space-y-2">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="Ask anything about your data..."
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={insertLastIntoNotebook}
            disabled={!messages.length}
          >
            Insert into notebook
          </Button>
          <Button
            size="sm"
            onClick={() => {
              if (!prompt.trim()) return;
              ask.mutate(prompt);
              setPrompt("");
            }}
            disabled={ask.isPending || !prompt.trim()}
          >
            {ask.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
