import { create } from "zustand";
import { persist } from "zustand/middleware";

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 720;

export type UIStore = {
  commandPaletteOpen: boolean;
  leftWidth: number;
  leftCollapsed: boolean;
  knowledgeOpen: boolean;
  knowledgeWidth: number;

  toggleCommandPalette: () => void;
  setCommandPalette: (open: boolean) => void;

  setLeftWidth: (w: number) => void;
  toggleLeft: () => void;
  setLeftCollapsed: (c: boolean) => void;

  toggleKnowledge: () => void;
  setKnowledgeOpen: (open: boolean) => void;
  setKnowledgeWidth: (w: number) => void;
};

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      commandPaletteOpen: false,
      leftWidth: 288, // matches the old w-72 default
      leftCollapsed: false,
      knowledgeOpen: false,
      knowledgeWidth: 448, // 28rem, matches the previous fixed panel width

      toggleCommandPalette: () =>
        set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
      setCommandPalette: (open) => set({ commandPaletteOpen: open }),

      setLeftWidth: (w) =>
        set({
          leftWidth: Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(w))),
        }),
      toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
      setLeftCollapsed: (c) => set({ leftCollapsed: c }),

      toggleKnowledge: () => set((s) => ({ knowledgeOpen: !s.knowledgeOpen })),
      setKnowledgeOpen: (open) => set({ knowledgeOpen: open }),
      setKnowledgeWidth: (w) =>
        set({
          knowledgeWidth: Math.min(
            SIDEBAR_MAX,
            Math.max(SIDEBAR_MIN, Math.round(w))
          ),
        }),
    }),
    {
      name: "rednotebook-ui",
      partialize: (s) => ({
        leftWidth: s.leftWidth,
        leftCollapsed: s.leftCollapsed,
        knowledgeWidth: s.knowledgeWidth,
      }),
    }
  )
);
