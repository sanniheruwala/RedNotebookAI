"use client";

import * as React from "react";
import { Database, Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/sidebar/connection-dialog";
import { MetadataExplorer } from "@/components/sidebar/metadata-explorer";
import { useConnectionStore } from "@/store/connection-store";

export function LeftSidebar() {
  const connection = useConnectionStore((s) => s.connection);
  const connected = !!connection?.host;

  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-background/40">
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
              {connection?.host || "Not configured"}
            </div>
          </div>
        </div>
        <ConnectionDialog>
          <Button size="icon" variant="ghost" aria-label="Edit connection" className="shrink-0">
            <Settings2 className="h-4 w-4" />
          </Button>
        </ConnectionDialog>
      </div>

      <div className="border-b bg-muted/20 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        Metadata
      </div>
      <div className="flex-1 overflow-hidden">
        <MetadataExplorer />
      </div>

      <div className="border-t px-4 py-3">
        <ConnectionDialog>
          <Button size="sm" variant="ghost" className="h-8 w-full justify-start gap-2 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Discover schemas with AI
          </Button>
        </ConnectionDialog>
        {!connected && (
          <ConnectionDialog>
            <Button size="sm" variant="default" className="mt-2 h-8 w-full gap-2 text-xs">
              <Database className="h-3.5 w-3.5" />
              Configure Trino
            </Button>
          </ConnectionDialog>
        )}
      </div>
    </aside>
  );
}
