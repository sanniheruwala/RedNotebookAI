"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus, Sparkles, FileText, BarChart3, BookOpen, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useActiveNotebook,
  useActiveSelectedCellId,
  useNotebookStore,
} from "@/store/notebook-store";
import { SQLCell } from "@/components/notebook/sql-cell";
import { MarkdownCell } from "@/components/notebook/markdown-cell";
import { AIPromptCell } from "@/components/notebook/ai-prompt-cell";
import { VisualizationCell } from "@/components/notebook/visualization-cell";
import type { Cell, CellType } from "@/lib/types";

export function NotebookCanvas() {
  const notebook = useActiveNotebook();
  const cells = notebook.cells;
  const addCell = useNotebookStore((s) => s.addCell);
  const reorderCells = useNotebookStore((s) => s.reorderCells);
  const selectedCellId = useActiveSelectedCellId();
  const selectCell = useNotebookStore((s) => s.selectCell);
  const moveCell = useNotebookStore((s) => s.moveCell);
  const removeCell = useNotebookStore((s) => s.removeCell);

  // Keyboard navigation: j/k or ↑/↓ between cells, Backspace deletes selected.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ignore when typing into inputs/editors
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable ||
          target.closest(".monaco-editor"))
      ) {
        return;
      }
      if (!cells.length) return;
      const idx = selectedCellId
        ? cells.findIndex((c) => c.id === selectedCellId)
        : -1;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(cells.length - 1, (idx < 0 ? 0 : idx + 1));
        selectCell(cells[next].id);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(0, (idx < 0 ? 0 : idx - 1));
        selectCell(cells[next].id);
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "ArrowDown" && selectedCellId) {
        e.preventDefault();
        moveCell(selectedCellId, "down");
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "ArrowUp" && selectedCellId) {
        e.preventDefault();
        moveCell(selectedCellId, "up");
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedCellId && (e.metaKey || e.shiftKey)) {
        e.preventDefault();
        removeCell(selectedCellId);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cells, selectedCellId, selectCell, moveCell, removeCell]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = cells.findIndex((c) => c.id === active.id);
    const newIdx = cells.findIndex((c) => c.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    reorderCells(arrayMove(cells, oldIdx, newIdx).map((c) => c.id));
  };

  return (
    <main className="app-mesh relative flex h-full min-w-0 flex-1 flex-col">
      <ScrollArea className="scrollbar-thin flex-1">
        <div className="mx-auto w-full space-y-4 px-6 py-6 xl:px-10">
          {cells.length === 0 && <EmptyState />}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={cells.map((c) => c.id)} strategy={verticalListSortingStrategy}>
              <AnimatePresence initial={false}>
                {cells.map((cell) => (
                  <SortableCell
                    key={cell.id}
                    cell={cell}
                    selected={cell.id === selectedCellId}
                    onSelect={() => selectCell(cell.id)}
                  />
                ))}
              </AnimatePresence>
            </SortableContext>
          </DndContext>

          <CellInserter onAdd={(t) => addCell(t)} />
        </div>
      </ScrollArea>
    </main>
  );
}

function SortableCell({
  cell,
  selected,
  onSelect,
}: {
  cell: Cell;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cell.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : "auto",
    opacity: isDragging ? 0.85 : 1,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      onClick={onSelect}
      className={`group relative rounded-2xl ${selected ? "ring-brand" : ""}`}
    >
      {/* Drag handle. Always laid out (so the cursor doesn't leave its hit box
          mid-hover); visually fades in on cell hover or while dragging. Uses
          cursor-grab → grabbing while pressed. */}
      <button
        {...attributes}
        {...listeners}
        type="button"
        aria-label="Drag to reorder"
        className={`absolute -left-7 top-3 flex h-6 w-7 cursor-grab items-center justify-center rounded-md text-muted-foreground/60 opacity-0 transition-opacity hover:bg-accent hover:text-foreground hover:opacity-100 focus-visible:opacity-100 group-hover:opacity-100 active:cursor-grabbing ${isDragging ? "opacity-100" : ""}`}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {cell.cell_type === "sql" && <SQLCell cell={cell} />}
      {cell.cell_type === "markdown" && <MarkdownCell cell={cell} />}
      {cell.cell_type === "ai_prompt" && <AIPromptCell cell={cell} />}
      {cell.cell_type === "visualization" && <VisualizationCell cell={cell} />}
      {cell.cell_type !== "sql" &&
        cell.cell_type !== "markdown" &&
        cell.cell_type !== "ai_prompt" &&
        cell.cell_type !== "visualization" && (
          <div className="rounded-2xl border bg-card p-3 text-xs text-muted-foreground">
            Unsupported cell type: {cell.cell_type}
          </div>
        )}
    </motion.div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="card-premium relative overflow-hidden p-10 text-center"
    >
      <div className="absolute inset-x-0 -top-32 mx-auto h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative">
        <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/30">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="text-balance text-lg font-semibold tracking-tightish">
          Start your data story
        </div>
        <p className="mx-auto mt-1 max-w-sm text-balance text-sm leading-relaxed text-muted-foreground">
          Add a SQL cell to query Trino, a Markdown cell to narrate, or ask AI to
          draft a query in plain English.
        </p>
      </div>
    </motion.div>
  );
}

function CellInserter({ onAdd }: { onAdd: (type: CellType) => void }) {
  const items: { type: CellType; label: string; icon: React.ReactNode; hint?: string }[] = [
    { type: "sql", label: "SQL", icon: <FileText className="h-4 w-4" /> },
    { type: "markdown", label: "Markdown", icon: <BookOpen className="h-4 w-4" /> },
    { type: "ai_prompt", label: "Ask AI", icon: <Sparkles className="h-4 w-4 text-primary" /> },
    { type: "visualization", label: "Chart", icon: <BarChart3 className="h-4 w-4" /> },
  ];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="group/inserter relative"
    >
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border/60 transition-opacity group-hover/inserter:opacity-50" />
      <div className="relative flex flex-wrap items-center justify-center gap-1 rounded-full border bg-background/80 p-1 shadow-sm backdrop-blur-md mx-auto w-fit">
        <span className="flex items-center gap-1 pl-2.5 pr-1 text-xs text-muted-foreground">
          <Plus className="h-3.5 w-3.5" /> Add
        </span>
        {items.map(({ type, label, icon }) => (
          <Button
            key={type}
            size="sm"
            variant="ghost"
            onClick={() => onAdd(type)}
            className="h-7 gap-1.5 rounded-full px-3 text-xs"
          >
            {icon} {label}
          </Button>
        ))}
      </div>
    </motion.div>
  );
}
