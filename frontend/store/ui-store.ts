import { create } from "zustand";

/** Light-weight UI state that doesn't belong with the notebook or auth data. */
export type UIStore = {
  commandPaletteOpen: boolean;
  toggleCommandPalette: () => void;
  setCommandPalette: (open: boolean) => void;
};

export const useUIStore = create<UIStore>((set) => ({
  commandPaletteOpen: false,
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCommandPalette: (open) => set({ commandPaletteOpen: open }),
}));
