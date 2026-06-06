"use client";

import { Loader2 } from "lucide-react";
import { Topbar } from "@/components/topbar/topbar";
import { LeftSidebar } from "@/components/sidebar/left-sidebar";
import { RightSidebar } from "@/components/panels/right-sidebar";
import { NotebookCanvas } from "@/components/notebook/notebook-canvas";
import { NotebookTabs } from "@/components/notebook/notebook-tabs";
import { CommandPalette } from "@/components/command-palette";
import { useRequireAuth } from "@/hooks/use-auth";

export default function HomePage() {
  const status = useRequireAuth();

  if (status.isPending) {
    return (
      <main className="app-mesh grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (status.data?.auth_enabled && !status.data.authenticated) {
    // Redirect already dispatched; show a quick spinner while it lands.
    return (
      <main className="app-mesh grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <Topbar />
      <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">
        <LeftSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <NotebookTabs />
          <div className="flex flex-1 overflow-hidden">
            <NotebookCanvas />
          </div>
        </div>
        <RightSidebar />
      </div>
      <CommandPalette />
    </div>
  );
}
