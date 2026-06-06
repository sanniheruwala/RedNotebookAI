"use client";

import * as React from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/markdown";
import { useNotebookStore } from "@/store/notebook-store";
import type { MarkdownCell as MarkdownCellType } from "@/lib/types";

export function MarkdownCell({ cell }: { cell: MarkdownCellType }) {
  const [editing, setEditing] = React.useState(!cell.source);
  const updateCell = useNotebookStore((s) => s.updateCell);
  const removeCell = useNotebookStore((s) => s.removeCell);

  return (
    <div className="card-premium group/cell relative px-4 py-3">
      <div className="absolute -top-2.5 left-4 flex items-center gap-2">
        <Badge
          variant="outline"
          className="h-5 rounded-md border bg-background px-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Markdown
        </Badge>
      </div>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover/cell:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => setEditing((e) => !e)}
          aria-label={editing ? "Preview" : "Edit"}
        >
          {editing ? <Eye className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={() => removeCell(cell.id)}
          aria-label="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {editing ? (
        <Textarea
          value={cell.source}
          onChange={(e) =>
            updateCell(cell.id, (c) =>
              c.cell_type === "markdown" ? { ...c, source: e.target.value } : c
            )
          }
          onKeyDown={(e) => {
            // Shift+Enter / ⌘↵ / Ctrl↵ to preview
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.shiftKey)) {
              e.preventDefault();
              setEditing(false);
            }
          }}
          rows={6}
          placeholder={
            "# Heading 1\n## Heading 2\n### Heading 3\n\nSupports **bold**, *italic*, `inline code`, links, lists, tables, and ```language code blocks```."
          }
          className="resize-y border-none bg-transparent p-0 font-mono text-sm leading-relaxed shadow-none focus-visible:ring-0"
          autoFocus
        />
      ) : (
        <Markdown variant="cell">
          {cell.source ||
            "_Empty markdown cell. Click the pencil to edit, or press Esc when an empty cell is selected to delete._"}
        </Markdown>
      )}
    </div>
  );
}
