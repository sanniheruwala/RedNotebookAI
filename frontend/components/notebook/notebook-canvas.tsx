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
import { ArrowRight, BarChart3, BookOpen, Database, FileText, GripVertical, Plus, Sparkles, Upload } from "lucide-react";
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
import { requestImmediateSave } from "@/hooks/use-autosave";
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
        requestImmediateSave();
      } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "ArrowUp" && selectedCellId) {
        e.preventDefault();
        moveCell(selectedCellId, "up");
        requestImmediateSave();
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedCellId && (e.metaKey || e.shiftKey)) {
        e.preventDefault();
        removeCell(selectedCellId);
        requestImmediateSave();
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
    requestImmediateSave();
  };

  return (
    <main className="app-mesh relative flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <ScrollArea className="scrollbar-thin min-w-0 flex-1">
        <div className="mx-auto w-full min-w-0 space-y-4 px-6 py-6 xl:px-10">
          {cells.length === 0 && (
            <EmptyState
              onAddSql={() => {
                addCell("sql");
                requestImmediateSave();
              }}
              onAddMarkdown={() => {
                addCell("markdown");
                requestImmediateSave();
              }}
              onAddAi={() => {
                addCell("ai_prompt");
                requestImmediateSave();
              }}
            />
          )}

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

          <CellInserter
            onAdd={(t) => {
              addCell(t);
              requestImmediateSave();
            }}
          />
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
      className={`group relative min-w-0 rounded-2xl ${selected ? "ring-brand" : ""}`}
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

function EmptyState({
  onAddSql,
  onAddMarkdown,
  onAddAi,
}: {
  onAddSql: () => void;
  onAddMarkdown: () => void;
  onAddAi: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="card-premium relative overflow-hidden p-8"
    >
      <div className="absolute inset-x-0 -top-32 mx-auto h-64 w-64 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-primary/25 to-primary/5 ring-1 ring-primary/30">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="text-balance text-lg font-semibold tracking-tightish">
            Start your data story
          </div>
          <p className="mx-auto mt-1 max-w-md text-balance text-sm leading-relaxed text-muted-foreground">
            Pick a starting move. You can mix cell types in any order later.
          </p>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-3">
          <StartCard
            icon={<Upload className="h-4 w-4 text-primary" />}
            title="Drop a CSV"
            body="Drag a CSV / Parquet / JSON file anywhere. DuckDB picks it up as a queryable table instantly."
            hint="Or click the + in the Files panel"
            cta="Drag a file →"
            onClick={() => {
              // No direct upload action from here — guide the user to the
              // window-level drop zone instead. Clicking adds a SQL cell so
              // they can also write `SELECT * FROM <file>` after dropping.
              onAddSql();
            }}
          />
          <StartCard
            icon={<Database className="h-4 w-4 text-primary" />}
            title="Run a SQL cell"
            body="Write a query against the active connection. ⌘↵ runs it; click Profile to see column stats."
            cta="Add SQL cell"
            ctaIcon={<ArrowRight className="h-3 w-3" />}
            onClick={onAddSql}
            highlight
          />
          <StartCard
            icon={<Sparkles className="h-4 w-4 text-primary" />}
            title="Ask AI"
            body="Describe what you want in plain English and the AI provider drafts the SQL — promote any reply to a SQL cell."
            cta="Add Ask AI cell"
            ctaIcon={<ArrowRight className="h-3 w-3" />}
            onClick={onAddAi}
          />
        </div>
        <div className="mt-5 text-center">
          <button
            type="button"
            onClick={onAddMarkdown}
            className="text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Or start with a Markdown intro cell →
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function StartCard({
  icon,
  title,
  body,
  cta,
  hint,
  ctaIcon,
  onClick,
  highlight = false,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta: string;
  hint?: string;
  ctaIcon?: React.ReactNode;
  onClick: () => void;
  highlight?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10 ${
        highlight ? "ring-1 ring-primary/30" : ""
      }`}
    >
      <div className="mb-2 grid h-8 w-8 place-items-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
        {icon}
      </div>
      <div className="text-[13.5px] font-semibold leading-snug tracking-tightish">
        {title}
      </div>
      <p className="mt-1 flex-1 text-[12px] leading-relaxed text-muted-foreground">
        {body}
      </p>
      {hint && (
        <div className="mt-2 text-[10px] text-muted-foreground/70">{hint}</div>
      )}
      <div className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-primary opacity-80 transition-opacity group-hover:opacity-100">
        {cta}
        {ctaIcon}
      </div>
    </button>
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
