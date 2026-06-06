"use client";

import * as React from "react";
import { BookMarked } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NotebookKnowledgeBody } from "@/components/notebook/notebook-knowledge";
import { useUIStore } from "@/store/ui-store";

/**
 * Right-edge drawer that hosts the per-notebook Knowledge surface. Toggled
 * from the topbar; closes on Esc, click-outside, or the X button.
 */
export function KnowledgeDrawer() {
  const open = useUIStore((s) => s.knowledgeOpen);
  const setKnowledgeOpen = useUIStore((s) => s.setKnowledgeOpen);
  return (
    <Sheet open={open} onOpenChange={setKnowledgeOpen}>
      <SheetContent side="right" className="p-0">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <BookMarked className="h-3.5 w-3.5 text-primary" />
            <SheetTitle>Knowledge</SheetTitle>
          </div>
          <SheetDescription>
            Sources, grounded chat, and infographics for this notebook.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <NotebookKnowledgeBody />
        </div>
      </SheetContent>
    </Sheet>
  );
}
