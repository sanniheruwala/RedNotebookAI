"use client";

import * as React from "react";
import { AIPanel } from "@/components/panels/ai-panel";

/**
 * The right sidebar hosts the global AI assistant. Knowledge used to live
 * here as a sibling tab; in v0.2.0 it moved inline to each notebook as a
 * collapsible footer panel (NotebookKnowledge) since it's always
 * notebook-scoped in practice.
 */
export function RightSidebar() {
  return (
    <div className="flex h-full w-full flex-col">
      <AIPanel />
    </div>
  );
}
