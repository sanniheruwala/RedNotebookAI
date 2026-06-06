"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { BookMarked, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotebookKnowledgeBody } from "@/components/notebook/notebook-knowledge";
import { useUIStore } from "@/store/ui-store";

const PANEL_WIDTH = 448; // 28rem — matches the previous sheet width on sm+

/**
 * Right-side Knowledge panel. Lives inline in the layout so opening it
 * squeezes the notebook canvas via flex (rather than overlaying it like a
 * modal would). Width animates between 0 and PANEL_WIDTH.
 */
export function KnowledgeDrawer() {
  const open = useUIStore((s) => s.knowledgeOpen);
  const setKnowledgeOpen = useUIStore((s) => s.setKnowledgeOpen);

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

  return (
    <motion.aside
      initial={false}
      animate={{ width: open ? PANEL_WIDTH : 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="shrink-0 overflow-hidden border-l bg-background"
      aria-hidden={!open}
    >
      <div className="flex h-full flex-col" style={{ width: PANEL_WIDTH }}>
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
        <div className="min-h-0 flex-1 overflow-hidden">
          <NotebookKnowledgeBody />
        </div>
      </div>
    </motion.aside>
  );
}
