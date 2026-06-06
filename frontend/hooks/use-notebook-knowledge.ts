"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useKnowledgeStore } from "@/store/knowledge-store";

/**
 * Resolve (or lazily create) the knowledge notebook bound to a SQL notebook.
 *
 * Behavior:
 *  1. If a binding already exists in localStorage, return that id.
 *  2. Otherwise, look up an existing knowledge notebook with the same name.
 *  3. Otherwise, create a new knowledge notebook named after the SQL one.
 *
 * The hook is intentionally lazy: it only creates a knowledge notebook when
 * the caller invokes `ensure()`. Components that only display state can
 * just read the (possibly undefined) `knowledgeNotebookId`.
 */
export function useNotebookKnowledge(
  notebookId: string,
  notebookTitle: string
) {
  const qc = useQueryClient();
  const getBinding = useKnowledgeStore((s) => s.getBinding);
  const setBinding = useKnowledgeStore((s) => s.setBinding);
  const clearBinding = useKnowledgeStore((s) => s.clearBinding);

  const list = useQuery({
    queryKey: ["knowledge-notebooks"],
    queryFn: api.listKnowledgeNotebooks,
  });

  const bound = getBinding(notebookId);
  // Resolve the bound id. We validate it against the server's known list
  // (a wiped /data/knowledge on the server would otherwise leave us pointing
  // at a knowledge notebook id that 404s), then fall back to a same-name
  // lookup before requiring an explicit ensure().
  const resolvedId = React.useMemo(() => {
    const knownIds = list.data
      ? new Set(list.data.notebooks.map((n) => n.id))
      : null;
    if (bound && knownIds && !knownIds.has(bound)) {
      clearBinding(notebookId);
    } else if (bound) {
      return bound;
    }
    const match = list.data?.notebooks.find(
      (n) => n.name === notebookTitle || n.name === `kb: ${notebookTitle}`
    );
    if (match) setBinding(notebookId, match.id);
    return match?.id;
  }, [bound, list.data, notebookTitle, notebookId, setBinding, clearBinding]);

  const create = useMutation({
    mutationFn: () =>
      api.createKnowledgeNotebook({
        name: notebookTitle || "Untitled",
        description: `Auto-bound to notebook ${notebookId.slice(0, 8)}`,
      }),
    onSuccess: (nb) => {
      setBinding(notebookId, nb.id);
      qc.invalidateQueries({ queryKey: ["knowledge-notebooks"] });
    },
  });

  const ensure = React.useCallback(async (): Promise<string> => {
    if (resolvedId) return resolvedId;
    const created = await create.mutateAsync();
    return created.id;
  }, [resolvedId, create]);

  return {
    knowledgeNotebookId: resolvedId,
    isResolving: list.isPending || create.isPending,
    ensure,
  };
}
