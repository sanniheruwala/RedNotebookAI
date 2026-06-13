"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileSpreadsheet, FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconForExt(ext: string) {
  if (ext === "csv" || ext === "tsv" || ext === "txt") return FileSpreadsheet;
  return FileText;
}

export function FilesSection() {
  const qc = useQueryClient();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const list = useQuery({
    queryKey: ["uploads"],
    queryFn: api.listUploads,
  });

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadFile(file),
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["uploads"] });
      toast.success(
        `Ready: \`${rec.table_name}\` (${rec.original_name})`,
        { description: "Query it from any SQL cell on the DuckDB connection." },
      );
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteUpload(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["uploads"] }),
    onError: (err: Error) => toast.error(err.message),
  });

  const files = list.data?.files ?? [];
  const supportedExtensions = (list.data?.supported_extensions ?? []).map((e) => `.${e}`);
  const acceptAttr = supportedExtensions.join(",");

  const onPickFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => upload.mutate(f));
  };

  return (
    <div data-tour-anchor="files-section">
      <div className="border-b border-t bg-muted/20 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <div className="flex items-center justify-between">
          <span>Files</span>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="grid h-5 w-5 place-items-center rounded text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
            aria-label="Upload file"
            title="Upload CSV / Parquet / JSON"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={acceptAttr || undefined}
        className="hidden"
        onChange={(e) => {
          onPickFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <div className="space-y-1 px-3 py-2">
        {list.isPending ? (
          <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : files.length === 0 ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex w-full flex-col items-start gap-1 rounded-lg border border-dashed border-border bg-muted/10 px-3 py-2 text-left text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
          >
            <div className="flex items-center gap-1.5 font-medium text-foreground/80">
              <Upload className="h-3 w-3" />
              Drop CSV, Parquet, or JSON
            </div>
            <div className="leading-snug">
              Or click here. Files become queryable DuckDB tables instantly —
              <code className="rounded bg-muted/40 px-1">SELECT * FROM &lt;filename&gt;</code>.
            </div>
          </button>
        ) : (
          files.map((f) => {
            const Icon = iconForExt(f.extension);
            return (
              <div
                key={f.id}
                className="group flex items-center gap-2 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Icon className="h-3 w-3 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-[11px] text-foreground">
                    {f.table_name}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground/70">
                    {f.original_name} · {formatSize(f.size_bytes)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete "${f.original_name}" (table \`${f.table_name}\`)?`,
                      )
                    ) {
                      remove.mutate(f.id);
                    }
                  }}
                  className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/60 opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                  aria-label={`Delete ${f.original_name}`}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })
        )}
        {upload.isPending && (
          <div className="flex items-center gap-2 px-1 py-1 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin text-primary" />
            Uploading…
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Page-wide drop zone. Listens for files dragged anywhere onto the window
 * and POSTs them through {@link api.uploadFile}. Shows a tinted overlay
 * while a drag is in flight so the user knows the drop will land.
 */
export function FilesDropOverlay() {
  const qc = useQueryClient();
  const [active, setActive] = React.useState(false);
  const dragCounter = React.useRef(0);

  const upload = useMutation({
    mutationFn: (file: File) => api.uploadFile(file),
    onSuccess: (rec) => {
      qc.invalidateQueries({ queryKey: ["uploads"] });
      toast.success(`Ready: \`${rec.table_name}\` (${rec.original_name})`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  React.useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes("Files");

    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounter.current += 1;
      setActive(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragCounter.current = Math.max(0, dragCounter.current - 1);
      if (dragCounter.current === 0) setActive(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter.current = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      files.forEach((f) => upload.mutate(f));
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
    };
  }, [upload]);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-primary/15 backdrop-blur-[2px]">
      <div className="rounded-2xl border-2 border-dashed border-primary/60 bg-background/95 px-8 py-6 text-center shadow-2xl">
        <div className="mb-1 flex items-center justify-center gap-2 text-base font-semibold text-primary">
          <Upload className="h-5 w-5" /> Drop to add as queryable table
        </div>
        <div className="text-[11px] text-muted-foreground">
          CSV, TSV, Parquet, JSON · DuckDB takes care of the rest
        </div>
      </div>
    </div>
  );
}
