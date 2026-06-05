"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookMarked, FileText, Image as ImageIcon, Loader2, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { KnowledgeNotebook, KnowledgeSource } from "@/lib/types";

export function KnowledgePanel() {
  const qc = useQueryClient();
  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [newName, setNewName] = React.useState("");

  const notebooks = useQuery({
    queryKey: ["knowledge-notebooks"],
    queryFn: api.listKnowledgeNotebooks,
  });

  const sources = useQuery({
    queryKey: ["knowledge-sources", activeId],
    queryFn: () => (activeId ? api.listKnowledgeSources(activeId) : Promise.resolve({ sources: [] })),
    enabled: !!activeId,
  });

  const create = useMutation({
    mutationFn: () => api.createKnowledgeNotebook({ name: newName || "New notebook" }),
    onSuccess: (nb) => {
      qc.invalidateQueries({ queryKey: ["knowledge-notebooks"] });
      setActiveId(nb.id);
      setNewName("");
      toast.success("Knowledge notebook created");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  React.useEffect(() => {
    if (!activeId && notebooks.data?.notebooks.length) {
      setActiveId(notebooks.data.notebooks[0].id);
    }
  }, [notebooks.data, activeId]);

  const generateInfographic = useMutation({
    mutationFn: () =>
      api.generateInfographic({
        notebook_id: activeId,
        template: "executive_kpi_brief",
        title_hint: "Latest snapshot",
        columns: [],
        sample_rows: [],
        aggregated_stats: {},
        persist: !!activeId,
      }),
    onSuccess: (res) => {
      const blob = new Blob([res.html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.success("Infographic generated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <BookMarked className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold tracking-tightish">Knowledge Notebook</div>
          <div className="text-[11px] leading-tight text-muted-foreground">
            Sources · summaries · infographics
          </div>
        </div>
      </div>

      <div className="space-y-2 border-b p-3">
        <Select
          value={activeId ?? ""}
          onChange={(e) => setActiveId(e.target.value || null)}
        >
          <option value="">— select notebook —</option>
          {notebooks.data?.notebooks.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </Select>
        <div className="flex gap-2">
          <Input
            placeholder="New notebook name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <Button size="icon" variant="secondary" onClick={() => create.mutate()} disabled={create.isPending}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <ScrollArea className="scrollbar-thin flex-1 px-3">
        <div className="space-y-2 py-3">
          {!activeId && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              Select or create a notebook to collect sources.
            </div>
          )}
          {sources.data?.sources.length === 0 && activeId && (
            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              No sources yet. Add SQL queries, results, or schemas from cells.
            </div>
          )}
          {(sources.data?.sources ?? []).map((src) => (
            <SourceRow key={src.id} src={src} />
          ))}
        </div>
      </ScrollArea>

      <div className="border-t p-3">
        <Button className="w-full" size="sm" onClick={() => generateInfographic.mutate()} disabled={generateInfographic.isPending}>
          {generateInfographic.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          Generate infographic
        </Button>
      </div>
    </div>
  );
}

function SourceRow({ src }: { src: KnowledgeSource }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{src.title}</span>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-widest">
          {src.source_type}
        </Badge>
      </div>
      {src.content && (
        <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">{src.content}</div>
      )}
    </div>
  );
}
