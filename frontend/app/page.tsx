"use client";

import { Loader2 } from "lucide-react";
import { Topbar } from "@/components/topbar/topbar";
import { LeftSidebar } from "@/components/sidebar/left-sidebar";
import { NotebookCanvas } from "@/components/notebook/notebook-canvas";
import { NotebookTabs } from "@/components/notebook/notebook-tabs";
import { CommandPalette } from "@/components/command-palette";
import { ResizableSidebar } from "@/components/resizable-sidebar";
import { KnowledgeDrawer } from "@/components/panels/knowledge-drawer";
import { useRequireAuth } from "@/hooks/use-auth";
import { useConnectionMigration } from "@/hooks/use-connection-migration";
import { useUIStore } from "@/store/ui-store";

export default function HomePage() {
  const status = useRequireAuth();
  const leftWidth = useUIStore((s) => s.leftWidth);
  const leftCollapsed = useUIStore((s) => s.leftCollapsed);
  const setLeftWidth = useUIStore((s) => s.setLeftWidth);
  const toggleLeft = useUIStore((s) => s.toggleLeft);

  // First-boot migration of the local Zustand connection cache into the
  // encrypted server store. Gated on auth resolving (either single-user
  // mode or successful sign-in) so we don't hit a 401.
  const migrationReady =
    !status.isPending &&
    (!status.data?.auth_enabled || !!status.data?.authenticated);
  useConnectionMigration(migrationReady);

  if (status.isPending) {
    return (
      <main className="app-mesh grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (status.data?.auth_enabled && !status.data.authenticated) {
    return (
      <main className="app-mesh grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar />
      <div className="group/layout flex h-[calc(100vh-3.5rem)] overflow-hidden">
        <ResizableSidebar
          side="left"
          width={leftWidth}
          collapsed={leftCollapsed}
          onResize={setLeftWidth}
          onToggle={toggleLeft}
        >
          <LeftSidebar />
        </ResizableSidebar>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <NotebookTabs />
          <div className="flex flex-1 overflow-hidden">
            <NotebookCanvas />
            <KnowledgeDrawer />
          </div>
        </div>
      </div>
      <CommandPalette />
    </div>
  );
}
