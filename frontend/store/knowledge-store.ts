import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Maps a SQL notebook id to the knowledge-notebook id that should "live with"
 * it. The first time a user does anything knowledge-related in a notebook, we
 * create a knowledge notebook on the backend and remember its id here so the
 * inline knowledge panel auto-targets it forever after.
 */
type KnowledgeStore = {
  bindings: Record<string, string>;
  getBinding: (notebookId: string) => string | undefined;
  setBinding: (notebookId: string, knowledgeNotebookId: string) => void;
  clearBinding: (notebookId: string) => void;
};

export const useKnowledgeStore = create<KnowledgeStore>()(
  persist(
    (set, get) => ({
      bindings: {},
      getBinding: (notebookId) => get().bindings[notebookId],
      setBinding: (notebookId, knowledgeNotebookId) =>
        set((s) => ({
          bindings: { ...s.bindings, [notebookId]: knowledgeNotebookId },
        })),
      clearBinding: (notebookId) =>
        set((s) => {
          const { [notebookId]: _gone, ...rest } = s.bindings;
          return { bindings: rest };
        }),
    }),
    { name: "rednotebook-knowledge-bindings" }
  )
);
