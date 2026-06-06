"use client";

import * as React from "react";
import { Command } from "cmdk";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useNotebookStore, useActiveNotebook } from "@/store/notebook-store";
import { useUIStore } from "@/store/ui-store";
import { useLogout } from "@/hooks/use-auth";

export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPalette);
  const toggle = useUIStore((s) => s.toggleCommandPalette);
  const addCell = useNotebookStore((s) => s.addCell);
  const newNotebook = useNotebookStore((s) => s.newNotebook);
  const notebook = useActiveNotebook();
  const { setTheme, resolvedTheme } = useTheme();
  const router = useRouter();
  const logout = useLogout();

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggle, open, setOpen]);

  if (!open) return null;

  const close = () => setOpen(false);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(notebook, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(notebook.metadata.title || "notebook")
      .toLowerCase()
      .replace(/\s+/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Notebook exported");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-24 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command label="Command Palette">
          <Command.Input
            placeholder="Type a command..."
            className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
            autoFocus
          />
          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">
              No commands match.
            </Command.Empty>
            <Command.Group heading="Cells">
              <CmdItem onSelect={() => { addCell("sql"); close(); }} hint="SQL">
                Add SQL cell
              </CmdItem>
              <CmdItem onSelect={() => { addCell("markdown"); close(); }} hint="MD">
                Add Markdown cell
              </CmdItem>
              <CmdItem onSelect={() => { addCell("ai_prompt"); close(); }} hint="AI">
                Add AI prompt cell
              </CmdItem>
            </Command.Group>
            <Command.Group heading="Notebook">
              <CmdItem onSelect={() => { newNotebook(); close(); }}>
                New notebook
              </CmdItem>
              <CmdItem onSelect={() => { exportJson(); close(); }}>
                Export notebook as JSON
              </CmdItem>
            </Command.Group>
            <Command.Group heading="Appearance">
              <CmdItem
                onSelect={() => {
                  setTheme(resolvedTheme === "dark" ? "light" : "dark");
                  close();
                }}
              >
                Toggle theme ({resolvedTheme === "dark" ? "light" : "dark"})
              </CmdItem>
              <CmdItem onSelect={() => { setTheme("system"); close(); }}>
                Use system theme
              </CmdItem>
            </Command.Group>
            <Command.Group heading="Account">
              <CmdItem onSelect={() => { router.push("/settings/tokens"); close(); }}>
                Manage API tokens
              </CmdItem>
              <CmdItem
                onSelect={() => {
                  close();
                  void logout();
                }}
              >
                Sign out
              </CmdItem>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function CmdItem({
  children,
  onSelect,
  hint,
}: {
  children: React.ReactNode;
  onSelect: () => void;
  hint?: string;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className="flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm aria-selected:bg-accent aria-selected:text-accent-foreground"
    >
      <span>{children}</span>
      {hint && (
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {hint}
        </span>
      )}
    </Command.Item>
  );
}
