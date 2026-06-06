/**
 * Connection helpers that abstract over the Trino vs DuckDB shapes so UI
 * components don't have to discriminate every time they need a label.
 */
import type { Connection } from "./types";

/** Is this connection minimally ready to issue queries with? */
export function isConfigured(
  c: Connection | null | undefined
): c is Connection {
  if (!c) return false;
  if (c.connector_type === "duckdb") return true; // embedded; always works
  return !!c.host && !!c.user;
}

/** Short, human-readable identifier suitable for chips / status rows. */
export function connectionLabel(c: Connection | null | undefined): string {
  if (!c) return "Not configured";
  if (c.connector_type === "duckdb") {
    if (c.database === ":memory:") return "DuckDB · in-memory";
    const base = c.database.split(/[\\/]/).pop() || c.database;
    return `DuckDB · ${base}`;
  }
  return c.host || "Trino not configured";
}

/** Stable key for TanStack Query cache busting when the connection changes. */
export function connectionKey(c: Connection | null | undefined): string {
  if (!c) return "none";
  if (c.connector_type === "duckdb") {
    return `duckdb:${c.database}:${c.working_dir ?? ""}`;
  }
  return `trino:${c.host}:${c.user}:${c.catalog ?? ""}:${c.schema ?? ""}`;
}
