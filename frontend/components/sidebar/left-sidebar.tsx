"use client";

import * as React from "react";
import { Database, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/sidebar/connection-dialog";
import { FilesSection } from "@/components/sidebar/files-section";
import { MetadataExplorer } from "@/components/sidebar/metadata-explorer";
import { NotebooksList } from "@/components/sidebar/notebooks-list";
import { useConnectionStore } from "@/store/connection-store";
import { connectionLabel, isConfigured } from "@/lib/connection";

export function LeftSidebar() {
  const connection = useConnectionStore((s) => s.connection);
  const connected = isConfigured(connection);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Connection
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                connected ? "bg-primary" : "bg-muted-foreground/40"
              }`}
            />
            <div className="truncate text-sm font-medium">
              {connectionLabel(connection)}
            </div>
          </div>
        </div>
        <ConnectionDialog>
          <Button size="icon" variant="ghost" aria-label="Edit connection" className="shrink-0">
            <Settings2 className="h-4 w-4" />
          </Button>
        </ConnectionDialog>
      </div>

      <NotebooksList />

      <FilesSection />

      <div className="border-b border-t bg-muted/20 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Metadata
      </div>
      <div className="flex-1 overflow-hidden">
        <MetadataExplorer />
      </div>

      {!connected && (
        <div className="border-t px-4 py-3">
          <ConnectionDialog>
            <Button size="sm" variant="default" className="h-8 w-full gap-2 text-xs">
              <Database className="h-3.5 w-3.5" />
              Configure connection
            </Button>
          </ConnectionDialog>
        </div>
      )}
    </div>
  );
}
