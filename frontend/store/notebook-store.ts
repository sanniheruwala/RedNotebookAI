import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuid } from "uuid";
import type {
  Cell,
  CellType,
  ChartConfig,
  Notebook,
  QueryResultPayload,
  RunQueryResponse,
} from "@/lib/types";

type CellResult = {
  result?: QueryResultPayload | null;
  error?: string | null;
  guardReasons?: string[];
  running?: boolean;
  ranAt?: number;
};

type NotebookStore = {
  notebooks: Record<string, Notebook>;
  tabs: string[];
  activeTab: string | null;
  selectedCellByTab: Record<string, string | null>;
  cellResultsByTab: Record<string, Record<string, CellResult>>;

  // Tab-level actions
  openTab: (notebook: Notebook) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  newNotebook: (title?: string) => string;
  replaceNotebook: (n: Notebook) => void;

  // Active-notebook actions
  setTitle: (title: string) => void;
  addCell: (type: CellType, afterId?: string | null) => string;
  updateCell: (id: string, updater: (cell: Cell) => Cell) => void;
  removeCell: (id: string) => void;
  duplicateCell: (id: string) => void;
  moveCell: (id: string, direction: "up" | "down") => void;
  reorderCells: (orderedIds: string[]) => void;
  selectCell: (id: string | null) => void;
  setCellResult: (id: string, result: CellResult) => void;
  setChartConfig: (id: string, chartConfig: ChartConfig) => void;
  ingestRunResponse: (id: string, response: RunQueryResponse) => void;
};

function uid() {
  return uuid().replace(/-/g, "");
}

function emptyNotebook(title = "Untitled Notebook"): Notebook {
  return {
    id: uid(),
    metadata: { title, tags: [], schema_version: 1 },
    cells: [
      {
        id: uid(),
        cell_type: "markdown",
        source:
          "# " + title + "\n\nWelcome to RedNotebook AI. Start by adding a SQL cell below.",
      },
      { id: uid(), cell_type: "sql", sql: "SELECT 1 AS hello" },
    ],
  };
}

function buildCell(type: CellType): Cell {
  const id = uid();
  switch (type) {
    case "markdown":
      return { id, cell_type: "markdown", source: "" };
    case "sql":
      return { id, cell_type: "sql", sql: "" };
    case "ai_prompt":
      return { id, cell_type: "ai_prompt", prompt: "" };
    case "visualization":
      return { id, cell_type: "visualization", chart_config: { chart_type: "bar" } };
    case "knowledge_note":
      return {
        id,
        cell_type: "knowledge_note",
        title: "Untitled note",
        body: "",
        knowledge_source_ids: [],
      };
  }
}

// Helper: mutate the active notebook safely.
function withActiveNotebook(
  state: NotebookStore,
  fn: (nb: Notebook) => Notebook
): Partial<NotebookStore> {
  const id = state.activeTab;
  if (!id) return {};
  const current = state.notebooks[id];
  if (!current) return {};
  const next = fn(current);
  return {
    notebooks: { ...state.notebooks, [id]: next },
  };
}

const initialNotebook = emptyNotebook();

export const useNotebookStore = create<NotebookStore>()(
  persist(
    (set, get) => ({
      notebooks: { [initialNotebook.id]: initialNotebook },
      tabs: [initialNotebook.id],
      activeTab: initialNotebook.id,
      selectedCellByTab: {},
      cellResultsByTab: {},

      openTab: (notebook) =>
        set((state) => {
          const nbs = { ...state.notebooks, [notebook.id]: notebook };
          const tabs = state.tabs.includes(notebook.id)
            ? state.tabs
            : [...state.tabs, notebook.id];
          return { notebooks: nbs, tabs, activeTab: notebook.id };
        }),

      closeTab: (id) =>
        set((state) => {
          const tabs = state.tabs.filter((t) => t !== id);
          const { [id]: _gone, ...rest } = state.notebooks;
          const { [id]: _resGone, ...restRes } = state.cellResultsByTab;
          const { [id]: _selGone, ...restSel } = state.selectedCellByTab;
          // If we closed the active tab, pick a neighbor; if none, create a fresh notebook.
          let activeTab = state.activeTab;
          if (activeTab === id) {
            if (tabs.length > 0) {
              const idx = state.tabs.indexOf(id);
              activeTab = tabs[Math.min(idx, tabs.length - 1)];
            } else {
              const fresh = emptyNotebook();
              return {
                notebooks: { ...rest, [fresh.id]: fresh },
                tabs: [fresh.id],
                activeTab: fresh.id,
                cellResultsByTab: restRes,
                selectedCellByTab: restSel,
              };
            }
          }
          return {
            notebooks: rest,
            tabs,
            activeTab,
            cellResultsByTab: restRes,
            selectedCellByTab: restSel,
          };
        }),

      switchTab: (id) =>
        set((state) => (state.notebooks[id] ? { activeTab: id } : {})),

      newNotebook: (title) => {
        const nb = emptyNotebook(title);
        set((state) => ({
          notebooks: { ...state.notebooks, [nb.id]: nb },
          tabs: [...state.tabs, nb.id],
          activeTab: nb.id,
        }));
        return nb.id;
      },

      replaceNotebook: (n) =>
        set((state) => ({
          notebooks: { ...state.notebooks, [n.id]: n },
          tabs: state.tabs.includes(n.id) ? state.tabs : [...state.tabs, n.id],
          activeTab: n.id,
        })),

      setTitle: (title) =>
        set((state) =>
          withActiveNotebook(state, (nb) => ({
            ...nb,
            metadata: { ...nb.metadata, title },
          }))
        ),

      addCell: (type, afterId) => {
        const cell = buildCell(type);
        set((state) =>
          withActiveNotebook(state, (nb) => {
            const cells = [...nb.cells];
            const idx = afterId ? cells.findIndex((c) => c.id === afterId) : -1;
            if (idx >= 0) cells.splice(idx + 1, 0, cell);
            else cells.push(cell);
            return { ...nb, cells };
          })
        );
        const tab = get().activeTab;
        if (tab) {
          set((state) => ({
            selectedCellByTab: { ...state.selectedCellByTab, [tab]: cell.id },
          }));
        }
        return cell.id;
      },

      updateCell: (id, updater) =>
        set((state) =>
          withActiveNotebook(state, (nb) => ({
            ...nb,
            cells: nb.cells.map((c) => (c.id === id ? updater(c) : c)),
          }))
        ),

      removeCell: (id) =>
        set((state) => {
          const partial = withActiveNotebook(state, (nb) => ({
            ...nb,
            cells: nb.cells.filter((c) => c.id !== id),
          }));
          const tab = state.activeTab;
          if (tab && state.selectedCellByTab[tab] === id) {
            return {
              ...partial,
              selectedCellByTab: { ...state.selectedCellByTab, [tab]: null },
            };
          }
          return partial;
        }),

      duplicateCell: (id) =>
        set((state) =>
          withActiveNotebook(state, (nb) => {
            const idx = nb.cells.findIndex((c) => c.id === id);
            if (idx < 0) return nb;
            const copy = { ...nb.cells[idx], id: uid() } as Cell;
            const cells = [...nb.cells];
            cells.splice(idx + 1, 0, copy);
            return { ...nb, cells };
          })
        ),

      moveCell: (id, direction) =>
        set((state) =>
          withActiveNotebook(state, (nb) => {
            const cells = [...nb.cells];
            const idx = cells.findIndex((c) => c.id === id);
            const target = direction === "up" ? idx - 1 : idx + 1;
            if (idx < 0 || target < 0 || target >= cells.length) return nb;
            [cells[idx], cells[target]] = [cells[target], cells[idx]];
            return { ...nb, cells };
          })
        ),

      reorderCells: (orderedIds) =>
        set((state) =>
          withActiveNotebook(state, (nb) => {
            const byId = new Map(nb.cells.map((c) => [c.id, c]));
            const next = orderedIds
              .map((id) => byId.get(id))
              .filter(Boolean) as Cell[];
            for (const c of nb.cells) {
              if (!orderedIds.includes(c.id)) next.push(c);
            }
            return { ...nb, cells: next };
          })
        ),

      selectCell: (id) =>
        set((state) => {
          const tab = state.activeTab;
          if (!tab) return {};
          return {
            selectedCellByTab: { ...state.selectedCellByTab, [tab]: id },
          };
        }),

      setCellResult: (id, result) =>
        set((state) => {
          const tab = state.activeTab;
          if (!tab) return {};
          const prevTabRes = state.cellResultsByTab[tab] ?? {};
          return {
            cellResultsByTab: {
              ...state.cellResultsByTab,
              [tab]: { ...prevTabRes, [id]: { ...(prevTabRes[id] ?? {}), ...result } },
            },
          };
        }),

      setChartConfig: (id, chartConfig) =>
        set((state) =>
          withActiveNotebook(state, (nb) => ({
            ...nb,
            cells: nb.cells.map((c) =>
              c.id === id && c.cell_type === "sql"
                ? { ...c, chart_config: chartConfig }
                : c
            ),
          }))
        ),

      ingestRunResponse: (id, response) => {
        get().setCellResult(id, {
          result: response.result,
          error: response.error ?? null,
          guardReasons: response.guard.reasons,
          running: false,
          ranAt: Date.now(),
        });
      },
    }),
    {
      name: "rednotebook-notebooks",
      // Persist the open tab set + notebooks content + active tab.
      // Skip selection + results (transient).
      partialize: (state) => ({
        notebooks: state.notebooks,
        tabs: state.tabs,
        activeTab: state.activeTab,
      }),
    }
  )
);

// ----- Selector hooks ---------------------------------------------------------
export function useActiveNotebook(): Notebook {
  return useNotebookStore((s) => {
    if (s.activeTab && s.notebooks[s.activeTab]) return s.notebooks[s.activeTab];
    // Fallback empty notebook so consumers don't crash. activeTab should always be set.
    return {
      id: "empty",
      metadata: { title: "Untitled Notebook", tags: [], schema_version: 1 },
      cells: [],
    } satisfies Notebook;
  });
}

export function useActiveSelectedCellId(): string | null {
  return useNotebookStore((s) => (s.activeTab ? s.selectedCellByTab[s.activeTab] ?? null : null));
}

export function useActiveCellResults(): Record<string, CellResult> {
  return useNotebookStore((s) =>
    s.activeTab ? s.cellResultsByTab[s.activeTab] ?? {} : {}
  );
}

export function useActiveCellResult(cellId: string): CellResult | undefined {
  return useNotebookStore((s) => {
    if (!s.activeTab) return undefined;
    return s.cellResultsByTab[s.activeTab]?.[cellId];
  });
}
