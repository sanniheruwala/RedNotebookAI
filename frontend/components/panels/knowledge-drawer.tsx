"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookMarked, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotebookKnowledgeBody } from "@/components/notebook/notebook-knowledge";
import { useUIStore } from "@/store/ui-store";

/**
 * Right-side Knowledge panel. Lives inline in the layout so opening it
 * squeezes the notebook canvas via flex (rather than overlaying it like a
 * modal would). User-resizable via the inner-edge drag handle; width is
 * persisted across reloads.
 */
export function KnowledgeDrawer() {
  const open = useUIStore((s) => s.knowledgeOpen);
  const setKnowledgeOpen = useUIStore((s) => s.setKnowledgeOpen);
  const width = useUIStore((s) => s.knowledgeWidth);
  const setKnowledgeWidth = useUIStore((s) => s.setKnowledgeWidth);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
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
        setKnowledgeOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, setKnowledgeOpen]);

  const draggingRef = React.useRef<{ startX: number; startW: number } | null>(
    null,
  );
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingRef.current = { startX: e.clientX, startW: width };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = draggingRef.current;
    if (!d) return;
    // Right-side panel: dragging left grows the panel, so invert the delta.
    setKnowledgeWidth(d.startW - (e.clientX - d.startX));
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? width : 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      style={{ width: open ? width : 0 }}
      className="relative shrink-0 overflow-hidden border-l bg-background"
      aria-hidden={!open}
    >
      <div className="flex h-full min-w-0 flex-col" style={{ width }}>
        <header className="flex items-start justify-between gap-2 border-b bg-muted/30 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <BookMarked className="h-3.5 w-3.5 text-primary" />
              <h2 className="text-sm font-semibold tracking-tight">Knowledge</h2>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sources, grounded chat, and infographics for this notebook.
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 shrink-0"
            aria-label="Close knowledge panel"
            onClick={() => setKnowledgeOpen(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <NotebookKnowledgeBody />
        </div>
      </div>
      {open && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize knowledge panel"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="absolute inset-y-0 left-0 z-20 w-1.5 cursor-col-resize touch-none transition-colors hover:bg-primary/40"
        />
      )}
    </motion.aside>
  );
}
