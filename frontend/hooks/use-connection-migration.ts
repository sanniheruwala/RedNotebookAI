"use client";

import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useConnectionStore } from "@/store/connection-store";

const MIGRATION_FLAG = "rednotebook-connection-migrated-v1";

/**
 * One-shot: when the app boots, if the user has zero saved connections,
 * persist whatever the local Zustand cache holds (default DuckDB on fresh
 * installs, or whatever the user had configured in v0.5.x) to the
 * encrypted server-side store. Marks itself done in localStorage so a
 * deleted seed connection doesn't keep reappearing.
 */
export function useConnectionMigration(enabled: boolean) {
  const ran = useRef(false);
  const qc = useQueryClient();
  const localConn = useConnectionStore((s) => s.connection);
  const setActiveId = useConnectionStore((s) => s.setActiveConnectionId);
  const activeId = useConnectionStore((s) => s.activeConnectionId);

  const saved = useQuery({
    queryKey: ["saved-connections"],
    queryFn: api.listSavedConnections,
    enabled,
  });

  const create = useMutation({
    mutationFn: (cfg: typeof localConn) =>
      api.createSavedConnection({
        name: cfg?.connection_name || "Local connection",
        config: cfg!,
      }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ["saved-connections"] });
      if (!activeId) setActiveId(record.id);
    },
  });

  useEffect(() => {
    if (!enabled || ran.current) return;
    if (saved.isPending) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(MIGRATION_FLAG)) return;
    if ((saved.data?.length ?? 0) > 0) {
      // Already has saved connections — adopt the first as active if none set.
      if (!activeId && saved.data && saved.data[0]) {
        // Don't actually load here — picker will do that. Just mark done.
      }
      window.localStorage.setItem(MIGRATION_FLAG, "1");
      ran.current = true;
      return;
    }
    if (!localConn) {
      window.localStorage.setItem(MIGRATION_FLAG, "1");
      ran.current = true;
      return;
    }
    ran.current = true;
    create.mutate(localConn, {
      onSettled: () => {
        window.localStorage.setItem(MIGRATION_FLAG, "1");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, saved.isPending, saved.data, localConn]);
}
