"use client";

import * as React from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Plus, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { useNotebookStore } from "@/store/notebook-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function NotebookTabs() {
  const tabs = useNotebookStore((s) => s.tabs);
  const notebooks = useNotebookStore((s) => s.notebooks);
  const activeTab = useNotebookStore((s) => s.activeTab);
  const switchTab = useNotebookStore((s) => s.switchTab);
  const closeTab = useNotebookStore((s) => s.closeTab);
  const newNotebook = useNotebookStore((s) => s.newNotebook);
  const replaceNotebook = useNotebookStore((s) => s.replaceNotebook);
  const qc = useQueryClient();

  const create = useMutation({
    mutationFn: () => api.createNotebook({ title: "Untitled Notebook" }),
    onSuccess: (res) => {
      replaceNotebook(res.notebook);
      qc.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("New notebook");
    },
    onError: (err: Error) => {
      // Fall back to a purely local notebook (still functional, just unsaved on disk).
      newNotebook();
      toast.message("Created local notebook", { description: err.message });
    },
  });

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b bg-background/60 px-2 backdrop-blur">
      <ScrollArea className="flex-1">
        <div className="flex items-center gap-1 py-1">
          <AnimatePresence initial={false}>
            {tabs.map((id) => {
              const nb = notebooks[id];
              if (!nb) return null;
              const active = id === activeTab;
              return (
                <motion.div
                  key={id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    "group flex h-7 max-w-[200px] shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors cursor-pointer",
                    active
                      ? "border-primary/40 bg-primary/10 text-foreground shadow-sm shadow-primary/10"
                      : "border-transparent bg-transparent text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => switchTab(id)}
                  role="tab"
                  aria-selected={active}
                >
                  <FileText
                    className={cn(
                      "h-3 w-3 shrink-0",
                      active ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="truncate font-medium">
                    {nb.metadata.title || "Untitled"}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(id);
                    }}
                    className="grid h-4 w-4 shrink-0 place-items-center rounded text-muted-foreground/70 opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
                    aria-label={`Close ${nb.metadata.title}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </ScrollArea>
      <Button
        size="icon"
        variant="ghost"
        className="h-6 w-6"
        aria-label="New notebook"
        onClick={() => create.mutate()}
        disabled={create.isPending}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
