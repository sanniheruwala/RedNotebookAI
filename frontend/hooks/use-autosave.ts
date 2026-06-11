"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, HttpError } from "@/lib/api";
import { useActiveNotebook } from "@/store/notebook-store";

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error";

const DEBOUNCE_MS = 1500;
const SAVED_INDICATOR_MS = 1800;

// Module-level callback so non-React callers (the SQL-cell mutation
// onSuccess, the cell mutators that aren't worth wiring through React
// context) can ask for an immediate flush. The autosave hook registers
// itself on mount and unregisters on unmount, so there's at most one
// listener at any time.
let immediateSaveCallback: (() => void) | null = null;

export function requestImmediateSave(): void {
  immediateSaveCallback?.();
}

/**
 * Debounced autosave for the active notebook.
 *
 * - On notebook content change, debounce 1.5s, then PUT /api/notebooks/{id}.
 * - {@link requestImmediateSave} bypasses the debounce — used by the SQL
 *   cell after a successful run, and by structural ops (add/remove/move
 *   cells) where waiting feels wrong.
 * - Pauses while a save is in flight; coalesces follow-up edits into the
 *   next save once the request lands.
 * - The "empty" placeholder notebook (no real id) is skipped entirely so
 *   we never POST `{"id":"empty"}` to the server.
 */
export function useAutosave(): {
  status: AutosaveStatus;
  lastSavedAt: number | null;
  saveNow: () => Promise<void>;
} {
  const notebook = useActiveNotebook();
  const qc = useQueryClient();
  const [status, setStatus] = React.useState<AutosaveStatus>("idle");
  const [lastSavedAt, setLastSavedAt] = React.useState<number | null>(null);

  const debounceTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = React.useRef(false);
  const pendingAfterFlight = React.useRef(false);
  const lastSerialized = React.useRef<string | null>(null);
  // Holds the most recent notebook state across save calls so the
  // immediate-save callback always operates on the live data, not whatever
  // happened to be captured when its parent closure was created.
  const latestNotebook = React.useRef(notebook);
  latestNotebook.current = notebook;

  const isPlaceholder = notebook.id === "empty";

  const performSave = React.useCallback(async () => {
    const target = latestNotebook.current;
    if (target.id === "empty") return;
    const serialized = JSON.stringify(target);
    if (serialized === lastSerialized.current) {
      // Nothing changed since the last successful save.
      return;
    }
    if (inFlight.current) {
      pendingAfterFlight.current = true;
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    try {
      await api.saveNotebook(target.id, target);
      lastSerialized.current = serialized;
      setLastSavedAt(Date.now());
      setStatus("saved");
      // Bring the left-panel notebook list back up to date so a title
      // edit shows immediately. Same call the manual save uses.
      qc.invalidateQueries({ queryKey: ["notebooks"] });
    } catch (err) {
      const message =
        err instanceof HttpError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      console.warn("autosave failed:", message);
      setStatus("error");
    } finally {
      inFlight.current = false;
      // If anything changed mid-flight, run another save once we're back
      // on the main thread so we never lose the last-typed character.
      if (pendingAfterFlight.current) {
        pendingAfterFlight.current = false;
        setTimeout(() => {
          performSave();
        }, 0);
      }
    }
  }, [qc]);

  const saveNow = React.useCallback(async () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
    await performSave();
  }, [performSave]);

  // Register the module-level immediate-save hook for non-React callers.
  React.useEffect(() => {
    immediateSaveCallback = () => {
      // Fire-and-forget; the indicator will reflect saving / saved /
      // error as performSave updates state.
      void saveNow();
    };
    return () => {
      immediateSaveCallback = null;
    };
  }, [saveNow]);

  // Debounced save on notebook change.
  React.useEffect(() => {
    if (isPlaceholder) return;
    const serialized = JSON.stringify(notebook);
    if (lastSerialized.current === null) {
      // First time we see this notebook — treat the server copy as
      // authoritative until the user actually edits. Avoids triggering a
      // useless write right after a fresh load.
      lastSerialized.current = serialized;
      setStatus("idle");
      return;
    }
    if (serialized === lastSerialized.current) return;
    setStatus("dirty");
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      debounceTimer.current = null;
      void performSave();
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
        debounceTimer.current = null;
      }
    };
    // We intentionally depend on the serialized notebook string only —
    // wider deps would re-arm the timer on unrelated rerenders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(notebook), isPlaceholder]);

  // Flip the indicator from "saved" back to "idle" after a brief window so
  // it doesn't sit on screen forever once nothing's happening.
  React.useEffect(() => {
    if (status !== "saved") return;
    const t = setTimeout(() => setStatus("idle"), SAVED_INDICATOR_MS);
    return () => clearTimeout(t);
  }, [status]);

  // Reset the baseline when we switch notebooks so the new tab's first
  // edit registers as dirty, not as a delta vs. the previous tab.
  React.useEffect(() => {
    lastSerialized.current = null;
    setStatus("idle");
    setLastSavedAt(null);
  }, [notebook.id]);

  // Best-effort flush when the tab is about to close.
  React.useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      const target = latestNotebook.current;
      if (target.id === "empty") return;
      const serialized = JSON.stringify(target);
      if (serialized === lastSerialized.current) return;
      // Modern browsers gate the prompt on returnValue being set.
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  return { status, lastSavedAt, saveNow };
}
