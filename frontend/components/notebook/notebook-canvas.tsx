"use client";

import * as React from "react";
import { Plus, Sparkles, FileText, BarChart3, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotebookStore } from "@/store/notebook-store";
import { SQLCell } from "@/components/notebook/sql-cell";
import { MarkdownCell } from "@/components/notebook/markdown-cell";
import { AIPromptCell } from "@/components/notebook/ai-prompt-cell";
import type { CellType } from "@/lib/types";

export function NotebookCanvas() {
  const cells = useNotebookStore((s) => s.notebook.cells);
  const addCell = useNotebookStore((s) => s.addCell);

  return (
    <main className="flex h-full flex-1 flex-col bg-background">
      <ScrollArea className="scrollbar-thin flex-1">
        <div className="mx-auto w-full max-w-4xl space-y-4 p-6">
          {cells.length === 0 && (
            <div className="rounded-2xl border bg-card p-10 text-center">
              <FileText className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <div className="text-lg font-semibold">Empty notebook</div>
              <div className="text-sm text-muted-foreground">Add a cell below to start exploring data.</div>
            </div>
          )}
          {cells.map((cell) => {
            if (cell.cell_type === "sql") return <SQLCell key={cell.id} cell={cell} />;
            if (cell.cell_type === "markdown") return <MarkdownCell key={cell.id} cell={cell} />;
            if (cell.cell_type === "ai_prompt") return <AIPromptCell key={cell.id} cell={cell} />;
            return (
              <div key={cell.id} className="rounded-2xl border bg-card p-3 text-xs text-muted-foreground">
                Unsupported cell type: {cell.cell_type}
              </div>
            );
          })}
          <CellInserter onAdd={(t) => addCell(t)} />
        </div>
      </ScrollArea>
    </main>
  );
}

function CellInserter({ onAdd }: { onAdd: (type: CellType) => void }) {
  const items: { type: CellType; label: string; icon: React.ReactNode }[] = [
    { type: "sql", label: "SQL", icon: <FileText className="h-4 w-4" /> },
    { type: "markdown", label: "Markdown", icon: <BookOpen className="h-4 w-4" /> },
    { type: "ai_prompt", label: "AI prompt", icon: <Sparkles className="h-4 w-4" /> },
    { type: "visualization", label: "Chart", icon: <BarChart3 className="h-4 w-4" /> },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-dashed bg-muted/20 p-3">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        <Plus className="h-4 w-4" /> Add cell:
      </span>
      {items.map(({ type, label, icon }) => (
        <Button key={type} size="sm" variant="ghost" onClick={() => onAdd(type)}>
          {icon} {label}
        </Button>
      ))}
    </div>
  );
}
