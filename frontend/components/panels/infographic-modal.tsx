"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Code2, Download, FileImage, FileText, ImageIcon, Loader2, Share2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";
import type { InfographicBrief } from "@/lib/types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brief: InfographicBrief | null;
  template: string;
  sourceLabel?: string;
  rawHtml?: string;
};

type View = "designed" | "brief";

export function InfographicModal({
  open,
  onOpenChange,
  brief,
  template,
  sourceLabel,
  rawHtml,
}: Props) {
  // Default to the rendered HTML so the user immediately sees something
  // visual instead of the structured brief. Falls back to "brief" when no
  // HTML is available (e.g. mock provider failed to render).
  const [view, setView] = React.useState<View>(rawHtml ? "designed" : "brief");
  React.useEffect(() => {
    setView(rawHtml ? "designed" : "brief");
  }, [rawHtml, brief?.title]);

  const baseName = (brief?.title || "infographic")
    .toLowerCase()
    .replace(/\s+/g, "-");

  const downloadHtml = () => {
    if (!rawHtml) return;
    const blob = new Blob([rawHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [exporting, setExporting] = React.useState<"pdf" | "png" | null>(null);
  const downloadRendered = async (format: "pdf" | "png") => {
    if (!rawHtml || exporting) return;
    setExporting(format);
    try {
      const filename = `${baseName}.${format}`;
      const blob = await api.renderInfographic({ html: rawHtml, format, filename });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Saved ${filename}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message, { duration: 12000 });
    } finally {
      setExporting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[88vh] max-w-5xl gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">
          {brief?.title || "Infographic"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          AI-generated infographic
        </DialogDescription>

        <div className="flex items-center justify-between border-b bg-background/80 px-5 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="rounded-md border-primary/30 bg-primary/10 px-2 text-[10px] font-semibold uppercase tracking-widest text-primary"
            >
              Infographic
            </Badge>
            <div className="text-[11px] text-muted-foreground">
              {template.replaceAll("_", " ")}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {rawHtml && (
              <div className="mr-1 inline-flex overflow-hidden rounded-md border">
                <Button
                  size="sm"
                  variant={view === "designed" ? "secondary" : "ghost"}
                  onClick={() => setView("designed")}
                  className="h-7 gap-1.5 rounded-none border-0 px-2"
                >
                  <ImageIcon className="h-3.5 w-3.5" /> Designed
                </Button>
                <Button
                  size="sm"
                  variant={view === "brief" ? "secondary" : "ghost"}
                  onClick={() => setView("brief")}
                  className="h-7 gap-1.5 rounded-none border-0 px-2"
                >
                  <Code2 className="h-3.5 w-3.5" /> Brief
                </Button>
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={downloadHtml}
              disabled={!rawHtml}
              className="h-8 gap-1.5"
            >
              <Download className="h-3.5 w-3.5" /> HTML
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadRendered("pdf")}
              disabled={!rawHtml || exporting !== null}
              className="h-8 gap-1.5"
            >
              {exporting === "pdf" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {exporting === "pdf" ? "Rendering…" : "PDF"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => downloadRendered("png")}
              disabled={!rawHtml || exporting !== null}
              className="h-8 gap-1.5"
            >
              {exporting === "png" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileImage className="h-3.5 w-3.5" />
              )}
              {exporting === "png" ? "Rendering…" : "PNG"}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {!brief ? (
          <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
            No infographic available.
          </div>
        ) : view === "designed" && rawHtml ? (
          // Render the backend-generated HTML in a sandboxed iframe so the
          // user sees the actual designed artifact (not a JSON-looking
          // brief). srcDoc avoids the document.write path and keeps the
          // doc fully sandboxed — no cross-origin scripts.
          <iframe
            title={brief.title}
            srcDoc={rawHtml}
            sandbox="allow-same-origin"
            className="h-full w-full flex-1 bg-background"
          />
        ) : (
          <ScrollArea className="scrollbar-thin flex-1">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto max-w-3xl space-y-6 p-8"
            >
              <header className="space-y-2">
                <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-primary">
                  {sourceLabel || template.replaceAll("_", " ")}
                </div>
                <h1 className="text-balance text-3xl font-semibold tracking-tightish md:text-4xl">
                  {brief.title}
                </h1>
                <p className="text-balance text-base text-muted-foreground">
                  {brief.summary}
                </p>
              </header>

              {brief.key_metrics.length > 0 && (
                <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  {brief.key_metrics.map((m, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.04 * i + 0.1 }}
                      className="rounded-xl border bg-card p-4"
                    >
                      <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                        {m.label}
                      </div>
                      <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tightish">
                        {String(m.value)}
                      </div>
                    </motion.div>
                  ))}
                </section>
              )}

              {brief.insights.length > 0 && (
                <section>
                  <h2 className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Key insights
                  </h2>
                  <ul className="space-y-2 rounded-xl border bg-card/60 p-4">
                    {brief.insights.map((insight, i) => (
                      <motion.li
                        key={i}
                        initial={{ opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.06 * i + 0.2 }}
                        className="flex gap-3 text-sm leading-relaxed"
                      >
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        <span>{insight}</span>
                      </motion.li>
                    ))}
                  </ul>
                </section>
              )}

              {brief.narrative && (
                <section className="prose prose-sm prose-neutral dark:prose-invert max-w-none rounded-xl border bg-card/60 p-5">
                  <h2 className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    Narrative
                  </h2>
                  <p className="leading-relaxed">{brief.narrative}</p>
                </section>
              )}

              {brief.caveats.length > 0 && (
                <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-muted-foreground">
                  <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-amber-500">
                    <Share2 className="h-3 w-3" /> Caveats
                  </div>
                  <ul className="space-y-1">
                    {brief.caveats.map((c, i) => (
                      <li key={i}>{c}</li>
                    ))}
                  </ul>
                </section>
              )}
            </motion.div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
