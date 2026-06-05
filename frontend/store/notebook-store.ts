import { create } from "zustand";
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
  notebook: Notebook;
  selectedCellId: string | null;
  cellResults: Record<string, CellResult>;
  setNotebook: (n: Notebook) => void;
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
  loadFromQueryResponse: (id: string, response: RunQueryResponse) => void;
};

function emptyNotebook(): Notebook {
  return {
    id: uuid().replace(/-/g, ""),
    metadata: {
      title: "Untitled Notebook",
      tags: [],
      schema_version: 1,
    },
    cells: [
      {
        id: uuid().replace(/-/g, ""),
        cell_type: "markdown",
        source: "# Welcome to RedNotebook AI\n\nAdd a SQL cell below to get started.",
      },
      {
        id: uuid().replace(/-/g, ""),
        cell_type: "sql",
        sql: "SELECT 1 AS hello",
      },
    ],
  };
}

function buildCell(type: CellType): Cell {
  const id = uuid().replace(/-/g, "");
  switch (type) {
    case "markdown":
      return { id, cell_type: "markdown", source: "" };
    case "sql":
      return { id, cell_type: "sql", sql: "" };
    case "ai_prompt":
      return { id, cell_type: "ai_prompt", prompt: "" };
    case "visualization":
      return {
        id,
        cell_type: "visualization",
        chart_config: { chart_type: "bar" },
      };
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

export const useNotebookStore = create<NotebookStore>((set, get) => ({
  notebook: emptyNotebook(),
  selectedCellId: null,
  cellResults: {},

  setNotebook: (notebook) => set({ notebook, cellResults: {} }),

  setTitle: (title) =>
    set((state) => ({
      notebook: { ...state.notebook, metadata: { ...state.notebook.metadata, title } },
    })),

  addCell: (type, afterId) => {
    const cell = buildCell(type);
    set((state) => {
      const cells = [...state.notebook.cells];
      const idx = afterId ? cells.findIndex((c) => c.id === afterId) : -1;
      if (idx >= 0) {
        cells.splice(idx + 1, 0, cell);
      } else {
        cells.push(cell);
      }
      return { notebook: { ...state.notebook, cells }, selectedCellId: cell.id };
    });
    return cell.id;
  },

  updateCell: (id, updater) =>
    set((state) => ({
      notebook: {
        ...state.notebook,
        cells: state.notebook.cells.map((c) => (c.id === id ? updater(c) : c)),
      },
    })),

  removeCell: (id) =>
    set((state) => ({
      notebook: {
        ...state.notebook,
        cells: state.notebook.cells.filter((c) => c.id !== id),
      },
      selectedCellId: state.selectedCellId === id ? null : state.selectedCellId,
    })),

  duplicateCell: (id) =>
    set((state) => {
      const idx = state.notebook.cells.findIndex((c) => c.id === id);
      if (idx < 0) return state;
      const copy = { ...state.notebook.cells[idx], id: uuid().replace(/-/g, "") };
      const cells = [...state.notebook.cells];
      cells.splice(idx + 1, 0, copy as Cell);
      return { notebook: { ...state.notebook, cells } };
    }),

  moveCell: (id, direction) =>
    set((state) => {
      const cells = [...state.notebook.cells];
      const idx = cells.findIndex((c) => c.id === id);
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (idx < 0 || target < 0 || target >= cells.length) return state;
      [cells[idx], cells[target]] = [cells[target], cells[idx]];
      return { notebook: { ...state.notebook, cells } };
    }),

  reorderCells: (orderedIds) =>
    set((state) => {
      const byId = new Map(state.notebook.cells.map((c) => [c.id, c]));
      const next = orderedIds.map((id) => byId.get(id)).filter(Boolean) as Cell[];
      // Preserve any cells not present in orderedIds (defensive)
      const seen = new Set(orderedIds);
      for (const c of state.notebook.cells) {
        if (!seen.has(c.id)) next.push(c);
      }
      return { notebook: { ...state.notebook, cells: next } };
    }),

  selectCell: (id) => set({ selectedCellId: id }),

  setCellResult: (id, result) =>
    set((state) => ({
      cellResults: { ...state.cellResults, [id]: { ...(state.cellResults[id] ?? {}), ...result } },
    })),

  setChartConfig: (id, chartConfig) =>
    set((state) => ({
      notebook: {
        ...state.notebook,
        cells: state.notebook.cells.map((c) =>
          c.id === id && c.cell_type === "sql" ? { ...c, chart_config: chartConfig } : c
        ),
      },
    })),

  ingestRunResponse: (id, response) =>
    get().setCellResult(id, {
      result: response.result,
      error: response.error ?? null,
      guardReasons: response.guard.reasons,
      running: false,
      ranAt: Date.now(),
    }),

  loadFromQueryResponse: (id, response) => {
    get().setCellResult(id, {
      result: response.result,
      error: response.error,
      guardReasons: response.guard.reasons,
      running: false,
      ranAt: Date.now(),
    });
  },
}));
