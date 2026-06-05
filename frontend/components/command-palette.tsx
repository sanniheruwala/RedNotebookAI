"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useNotebookStore } from "@/store/notebook-store";

export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const addCell = useNotebookStore((s) => s.addCell);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-24 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Palette">
          <Command.Input
            placeholder="Type a command..."
            className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No commands match.
            </Command.Empty>
            <Command.Group heading="Cells">
              <CmdItem onSelect={() => { addCell("sql"); setOpen(false); }} hint="⌘N">
                Add SQL cell
              </CmdItem>
              <CmdItem onSelect={() => { addCell("markdown"); setOpen(false); }}>
                Add Markdown cell
              </CmdItem>
              <CmdItem onSelect={() => { addCell("ai_prompt"); setOpen(false); }}>
                Add AI prompt cell
              </CmdItem>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function CmdItem({ children, onSelect, hint }: { children: React.ReactNode; onSelect: () => void; hint?: string }) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      <span>{children}</span>
      {hint && <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{hint}</span>}
    </Command.Item>
  );
}
