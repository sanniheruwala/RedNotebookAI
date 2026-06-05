"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useNotebookStore } from "@/store/notebook-store";
import type { MarkdownCell as MarkdownCellType } from "@/lib/types";

export function MarkdownCell({ cell }: { cell: MarkdownCellType }) {
  const [editing, setEditing] = React.useState(!cell.source);
  const updateCell = useNotebookStore((s) => s.updateCell);
  const removeCell = useNotebookStore((s) => s.removeCell);

  return (
    <div className="group rounded-2xl border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between pb-2">
        <Badge variant="outline" className="text-[10px] uppercase tracking-widest">Markdown</Badge>
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button size="icon" variant="ghost" onClick={() => setEditing((e) => !e)}>
            {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => removeCell(cell.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {editing ? (
        <Textarea
          value={cell.source}
          onChange={(e) =>
            updateCell(cell.id, (c) => (c.cell_type === "markdown" ? { ...c, source: e.target.value } : c))
          }
          rows={6}
          placeholder="Write markdown..."
          className="resize-y font-mono text-sm"
        />
      ) : (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{cell.source || "*Empty markdown cell*"}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
