"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotebookStore } from "@/store/notebook-store";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export function NotebooksList() {
  const qc = useQueryClient();
  const tabs = useNotebookStore((s) => s.tabs);
  const activeTab = useNotebookStore((s) => s.activeTab);
  const switchTab = useNotebookStore((s) => s.switchTab);
  const closeTab = useNotebookStore((s) => s.closeTab);
  const replaceNotebook = useNotebookStore((s) => s.replaceNotebook);
  const newNotebook = useNotebookStore((s) => s.newNotebook);

  const list = useQuery({
    queryKey: ["notebooks"],
    queryFn: api.listNotebooks,
  });

  const create = useMutation({
    mutationFn: () => api.createNotebook({ title: "Untitled Notebook" }),
    onSuccess: (res) => {
      replaceNotebook(res.notebook);
      qc.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("New notebook");
    },
    onError: (err: Error) => {
      newNotebook();
      toast.message("Created local notebook", { description: err.message });
    },
  });

  const open = useMutation({
    mutationFn: (id: string) => api.getNotebook(id),
    onSuccess: (res) => replaceNotebook(res.notebook),
    onError: (err: Error) => toast.error(`Failed to open: ${err.message}`),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteNotebook(id),
    onSuccess: (_data, id) => {
      closeTab(id);
      qc.invalidateQueries({ queryKey: ["notebooks"] });
      toast.success("Notebook deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const openTabSet = new Set(tabs);

  return (
    // No `h-full` here: the parent left sidebar is a flex column, and
    // letting Notebooks claim the full height was pushing the Metadata
    // section and its tree below the viewport.
    <div className="flex flex-shrink-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/20 px-4 py-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Notebooks
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => create.mutate()}
          disabled={create.isPending}
          aria-label="New notebook"
        >
          {create.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </Button>
      </div>
      <ScrollArea className="scrollbar-thin max-h-[28vh] flex-shrink-0">
        <div className="space-y-0.5 px-2 py-2">
          {list.isPending && (
            <div className="px-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
            </div>
          )}
          {list.error && (
            <div className="px-2 py-1 text-xs text-destructive">
              {(list.error as Error).message}
            </div>
          )}
          {(list.data?.notebooks ?? []).length === 0 && !list.isPending && (
            <div className="rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              No saved notebooks yet.
            </div>
          )}
          {(list.data?.notebooks ?? []).map((nb) => {
            const isActive = activeTab === nb.id;
            const isOpen = openTabSet.has(nb.id);
            return (
              <div
                key={nb.id}
                className={cn(
                  "group flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors",
                  isActive
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <button
                  type="button"
                  onClick={() => (isOpen ? switchTab(nb.id) : open.mutate(nb.id))}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <FileText
                    className={cn(
                      "h-3 w-3 shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className="truncate font-medium">{nb.title || "Untitled"}</span>
                  {isOpen && !isActive && (
                    <span className="text-[9px] uppercase tracking-widest text-muted-foreground/70">
                      open
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete "${nb.title}"?`)) {
                      remove.mutate(nb.id);
                    }
                  }}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                  aria-label={`Delete ${nb.title}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
