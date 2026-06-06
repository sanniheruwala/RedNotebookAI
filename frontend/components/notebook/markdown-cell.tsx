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
    <div className="card-premium group/cell relative p-4">
      <div className="absolute -top-2.5 left-4 flex items-center gap-2">
        <Badge variant="outline" className="h-5 rounded-md border bg-background px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Markdown
        </Badge>
      </div>
      <div className="flex justify-end opacity-0 transition-opacity group-hover/cell:opacity-100">
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing((e) => !e)}>
            {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => removeCell(cell.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {editing ? (
        <Textarea
          value={cell.source}
          onChange={(e) =>
            updateCell(cell.id, (c) =>
              c.cell_type === "markdown" ? { ...c, source: e.target.value } : c
            )
          }
          rows={6}
          placeholder="Write markdown, supports **bold**, *italic*, [links](url), code blocks, tables…"
          className="resize-y border-none bg-transparent p-0 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0"
          autoFocus
        />
      ) : (
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none prose-headings:tracking-tightish prose-headings:font-semibold prose-p:leading-relaxed prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-[12px] prose-code:font-normal prose-code:before:content-none prose-code:after:content-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {cell.source || "*Empty markdown cell, click the pencil to edit*"}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
