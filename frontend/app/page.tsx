import { Topbar } from "@/components/topbar/topbar";
import { LeftSidebar } from "@/components/sidebar/left-sidebar";
import { RightSidebar } from "@/components/panels/right-sidebar";
import { NotebookCanvas } from "@/components/notebook/notebook-canvas";
import { CommandPalette } from "@/components/command-palette";

export default function HomePage() {
  return (
    <div className="flex h-screen flex-col">
      <Topbar />
      <div className="flex h-[calc(100vh-3.5rem)]">
        <LeftSidebar />
        <NotebookCanvas />
        <RightSidebar />
      </div>
      <CommandPalette />
    </div>
  );
}
