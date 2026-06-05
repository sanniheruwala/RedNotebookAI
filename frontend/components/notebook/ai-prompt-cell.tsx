"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowRight, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useNotebookStore } from "@/store/notebook-store";
import { api } from "@/lib/api";
import type { AIPromptCell as AIPromptCellType } from "@/lib/types";

export function AIPromptCell({ cell }: { cell: AIPromptCellType }) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const removeCell = useNotebookStore((s) => s.removeCell);
  const addCell = useNotebookStore((s) => s.addCell);

  const generate = useMutation({
    mutationFn: () => api.aiGenerateSQL({ prompt: cell.prompt, context: {} }),
    onSuccess: (res) => {
      updateCell(cell.id, (c) =>
        c.cell_type === "ai_prompt" ? { ...c, response: res.sql, suggested_sql: res.sql } : c
      );
      toast.success(`Generated SQL via ${res.provider}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const accept = () => {
    if (!cell.suggested_sql) return;
    const id = addCell("sql", cell.id);
    updateCell(id, (c) => (c.cell_type === "sql" ? { ...c, sql: cell.suggested_sql ?? "" } : c));
    toast.success("Inserted SQL cell");
  };

  return (
    <div className="card-premium group/cell relative overflow-hidden p-4">
      {/* Decorative AI gradient */}
      <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative">
        <div className="mb-2 flex items-center justify-between">
          <Badge
            variant="outline"
            className="h-5 gap-1.5 rounded-md border-primary/30 bg-primary/10 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary"
          >
            <Sparkles className="h-2.5 w-2.5" /> Ask AI
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground opacity-0 hover:text-destructive group-hover/cell:opacity-100"
            onClick={() => removeCell(cell.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Textarea
          value={cell.prompt}
          onChange={(e) =>
            updateCell(cell.id, (c) =>
              c.cell_type === "ai_prompt" ? { ...c, prompt: e.target.value } : c
            )
          }
          rows={3}
          placeholder="Ask in plain English — e.g. “top 10 customers by revenue this quarter”"
          className="resize-y border-none bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
        />
        <div className="mt-3 flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => generate.mutate()}
            disabled={generate.isPending || !cell.prompt.trim()}
            className="gap-1.5 shadow-sm shadow-primary/25"
          >
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Generate SQL
          </Button>
          {cell.suggested_sql && (
            <Button size="sm" variant="outline" onClick={accept} className="gap-1.5">
              Insert as SQL <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <AnimatePresence>
          {cell.suggested_sql && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="mt-3 overflow-hidden"
            >
              <div className="rounded-xl border bg-muted/40 backdrop-blur-sm">
                <div className="flex items-center justify-between border-b border-border/60 px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                  <span>Suggested SQL</span>
                  <span className="text-primary">AI</span>
                </div>
                <pre className="max-h-48 overflow-auto p-3 text-xs">
                  <code className="font-mono">{cell.suggested_sql}</code>
                </pre>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
