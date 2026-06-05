"use client";

import * as React from "react";
import { Database, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/sidebar/connection-dialog";
import { MetadataExplorer } from "@/components/sidebar/metadata-explorer";
import { useConnectionStore } from "@/store/connection-store";

export function LeftSidebar() {
  const connection = useConnectionStore((s) => s.connection);
  return (
    <aside className="flex h-full w-72 shrink-0 flex-col border-r bg-background">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Connection</div>
          <div className="truncate text-sm font-medium">
            {connection?.host || "Not configured"}
          </div>
        </div>
        <ConnectionDialog>
          <Button size="icon" variant="ghost" aria-label="Edit connection">
            <Settings2 className="h-4 w-4" />
          </Button>
        </ConnectionDialog>
      </div>
      <div className="border-b px-4 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        Metadata
      </div>
      <div className="flex-1 overflow-hidden">
        <MetadataExplorer />
      </div>
    </aside>
  );
}
