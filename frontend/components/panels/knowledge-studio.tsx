"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookOpen, HelpCircle, Lightbulb, Loader2, Sparkles } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";

type SectionKey = "overview" | "faq" | "study_guide" | "suggested_questions";

const SECTIONS: Array<{
  key: SectionKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { key: "overview", label: "Overview", icon: BookOpen },
  { key: "faq", label: "FAQ", icon: HelpCircle },
  { key: "study_guide", label: "Study guide", icon: Sparkles },
  { key: "suggested_questions", label: "Ask next", icon: Lightbulb },
];

export function KnowledgeStudioDialog({
  open,
  onOpenChange,
  notebookId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  notebookId: string | null;
}) {
  const [data, setData] = React.useState<{
    provider: string;
    sections: Record<string, string>;
  } | null>(null);

  // Reset cached output whenever the user opens it against a different
  // notebook — stale Studio output against a freshly-changed source set
  // is more confusing than no output.
  const lastNotebookRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (open && notebookId !== lastNotebookRef.current) {
      setData(null);
      lastNotebookRef.current = notebookId;
    }
  }, [open, notebookId]);

  const generate = useMutation({
    mutationFn: () => {
      if (!notebookId) throw new Error("Select a notebook first");
      return api.knowledgeStudio({ notebook_id: notebookId });
    },
    onSuccess: (res) => setData({ provider: res.provider, sections: res.sections }),
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[80vh] max-w-4xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Knowledge Studio</DialogTitle>
        <DialogDescription className="sr-only">
          NotebookLM-style overview, FAQ, study guide, and suggested questions
        </DialogDescription>

        <div className="flex items-center justify-between border-b bg-background/80 px-5 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tightish">
                Studio
              </div>
              <div className="text-[11px] text-muted-foreground">
                Overview · FAQ · Study guide · Ask next
                {data?.provider && (
                  <span className="ml-1.5 text-muted-foreground/70">
                    · {data.provider}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => generate.mutate()}
              disabled={generate.isPending || !notebookId}
              className="h-8 gap-1.5 shadow-sm shadow-primary/20"
            >
              {generate.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {data ? "Regenerate" : "Generate"}
            </Button>
            {/* DialogContent's built-in DialogPrimitive.Close already renders
                the top-right X — adding our own here doubled it. */}
          </div>
        </div>

        {!data && !generate.isPending && (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-10 text-center text-sm text-muted-foreground">
            <Sparkles className="h-8 w-8 text-primary/60" />
            <p className="max-w-md">
              Click <strong>Generate</strong> to produce a NotebookLM-style
              briefing from every source in this knowledge notebook — overview,
              FAQ, study guide, and questions to ask next.
            </p>
          </div>
        )}

        {generate.isPending && !data && (
          <div className="flex h-full items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            Synthesising overview, FAQ, study guide, and follow-up questions…
          </div>
        )}

        {data && (
          <Tabs defaultValue="overview" className="flex h-full flex-col">
            <TabsList className="mx-5 mt-3 w-fit">
              {SECTIONS.map((s) => (
                <TabsTrigger key={s.key} value={s.key} className="gap-1.5">
                  <s.icon className="h-3.5 w-3.5" />
                  {s.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {SECTIONS.map((s) => (
              <TabsContent
                key={s.key}
                value={s.key}
                className="flex-1 overflow-hidden"
              >
                <ScrollArea className="scrollbar-thin h-full px-6 py-4">
                  <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
                    <Markdown variant="cell">
                      {data.sections[s.key] || "_No content for this section._"}
                    </Markdown>
                  </div>
                </ScrollArea>
              </TabsContent>
            ))}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
