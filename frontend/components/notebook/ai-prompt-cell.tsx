"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send, Sparkles, Trash2 } from "lucide-react";
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
    <div className="group rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between pb-2">
        <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
          <Sparkles className="h-3 w-3" /> AI prompt
        </Badge>
        <Button size="icon" variant="ghost" onClick={() => removeCell(cell.id)} className="opacity-0 group-hover:opacity-100">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        value={cell.prompt}
        onChange={(e) =>
          updateCell(cell.id, (c) => (c.cell_type === "ai_prompt" ? { ...c, prompt: e.target.value } : c))
        }
        rows={3}
        placeholder="e.g. show top 10 customers by revenue in 2025"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" onClick={() => generate.mutate()} disabled={generate.isPending}>
          {generate.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Generate SQL
        </Button>
        {cell.suggested_sql && (
          <Button size="sm" variant="secondary" onClick={accept}>
            Insert as SQL cell
          </Button>
        )}
      </div>
      {cell.suggested_sql && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-lg border bg-muted/30 p-3 text-xs">
          <code>{cell.suggested_sql}</code>
        </pre>
      )}
    </div>
  );
}
