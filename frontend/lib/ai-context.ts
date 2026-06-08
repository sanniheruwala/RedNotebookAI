import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { connectionKey } from "@/lib/connection";
import type { ColumnInfo, Connection } from "@/lib/types";

const DIALECT_BY_CONNECTOR: Record<string, string> = {
  trino: "trino",
  duckdb: "duckdb",
  postgresql: "postgresql",
  mysql: "mysql",
  mariadb: "mysql",
  sqlite: "sqlite",
  mssql: "tsql",
  snowflake: "snowflake",
  bigquery: "bigquery",
  redshift: "redshift",
  oracle: "oracle",
  clickhouse: "clickhouse",
  databricks: "databricks",
};

export type AIAvailableTable = {
  catalog: string;
  schema_name: string;
  name: string;
  columns: ColumnInfo[];
};

// Token-budget knobs. Cheap to inflate the *name* list because list_tables
// only returns a string per row. Column introspection is the expensive
// hop — restrict it to the tables that look relevant to the user's
// prompt + chat history.
const MAX_TABLES_NAMES = 300;
const MAX_TABLES_WITH_COLUMNS = 30;
const MAX_COLUMNS_PER_TABLE = 40;
const COLUMN_FETCH_CONCURRENCY = 6;

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "for",
  "from",
  "to",
  "in",
  "on",
  "by",
  "with",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "this",
  "that",
  "these",
  "those",
  "as",
  "at",
  "it",
  "its",
  "into",
  "out",
  "up",
  "down",
  "over",
  "under",
  "all",
  "any",
  "some",
  "no",
  "not",
  "me",
  "my",
  "i",
  "we",
  "you",
  "your",
  "their",
  "show",
  "get",
  "give",
  "list",
  "find",
  "fetch",
  "select",
  "where",
  "having",
  "group",
  "order",
  "limit",
  "top",
  "count",
  "sum",
  "avg",
  "max",
  "min",
  "rows",
  "row",
  "between",
  "than",
  "last",
  "first",
  "many",
  "much",
  "each",
  "per",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

type TableId = { catalog: string; schema_name: string; name: string };
type TableScore = TableId & { score: number };

/**
 * Rank a flat list of tables by relevance to the user's prompt and any
 * prior turns in this Ask AI cell. Heuristic — exact / prefix / substring
 * matches on each prompt token against the table name (and its
 * underscore-separated parts). Cheap, deterministic, and good enough to
 * keep the right table in the top-N when the warehouse has hundreds.
 */
function rankTables(tables: TableId[], queryTokens: string[]): TableScore[] {
  if (queryTokens.length === 0) {
    return tables.map((t) => ({ ...t, score: 0 }));
  }
  const tokSet = new Set(queryTokens);
  return tables
    .map((t) => {
      const name = t.name.toLowerCase();
      const parts = name.split(/[_\s-]+/);
      let score = 0;
      for (const q of queryTokens) {
        if (name === q) score += 100;
        else if (name === q + "s" || name === q.replace(/s$/, "")) score += 80;
        else if (parts.includes(q)) score += 40;
        else if (name.startsWith(q)) score += 25;
        else if (name.includes(q)) score += 15;
        // Catch fuzzy partials like "cust" → "customers"
        else if (q.length >= 4 && name.includes(q.slice(0, 4))) score += 6;
      }
      for (const part of parts) if (tokSet.has(part)) score += 12;
      // Tiny bias toward shorter names so "users" beats "users_audit_v2" when
      // both match equally — the canonical table is usually the shortest one.
      score -= Math.min(8, Math.floor(name.length / 8));
      return { ...t, score };
    })
    .sort((a, b) => b.score - a.score);
}

async function runWithConcurrency<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      try {
        out[idx] = await worker(items[idx]);
      } catch {
        // Keep going on partial failures — tables we can't introspect
        // simply skip column hydration; their name is still useful.
        out[idx] = undefined as R;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, lane),
  );
  return out;
}

/**
 * Discover the catalog/schema/table layout of the active connection and
 * pick the tables most relevant to a specific user prompt so the SQL
 * generator can pick the right identifiers instead of hallucinating.
 *
 * Two-phase: (1) enumerate every table name cheaply (capped at
 * {@link MAX_TABLES_NAMES}), (2) rank by prompt + history relevance and
 * hydrate columns only for the top {@link MAX_TABLES_WITH_COLUMNS}.
 *
 * Reuses the react-query cache used by the metadata explorer.
 */
export async function loadAvailableTables(
  qc: QueryClient,
  connection: Connection,
  opts: {
    catalog?: string | null;
    schema?: string | null;
    prompt?: string;
    history?: string;
  } = {},
): Promise<AIAvailableTable[]> {
  const key = connectionKey(connection);

  // ----- Phase 1: enumerate table names across every catalog / schema -----
  const catalogs = await qc.ensureQueryData({
    queryKey: ["catalogs", key],
    queryFn: () => api.listCatalogs(connection),
  });
  const catalogList = catalogs.catalogs.slice();
  if (opts.catalog && catalogList.includes(opts.catalog)) {
    catalogList.sort((a, b) =>
      a === opts.catalog ? -1 : b === opts.catalog ? 1 : 0,
    );
  }

  const flat: TableId[] = [];
  for (const catalog of catalogList) {
    if (flat.length >= MAX_TABLES_NAMES) break;
    let schemas: string[];
    try {
      const r = await qc.ensureQueryData({
        queryKey: ["schemas", key, catalog],
        queryFn: () => api.listSchemas(connection, catalog),
      });
      schemas = r.schemas.slice();
    } catch {
      continue;
    }
    if (opts.schema && schemas.includes(opts.schema)) {
      schemas.sort((a, b) =>
        a === opts.schema ? -1 : b === opts.schema ? 1 : 0,
      );
    }
    for (const schema of schemas) {
      if (flat.length >= MAX_TABLES_NAMES) break;
      let tableList: Array<{ name: string }>;
      try {
        const r = await qc.ensureQueryData({
          queryKey: ["tables", key, catalog, schema],
          queryFn: () => api.listTables(connection, catalog, schema),
        });
        tableList = r.tables;
      } catch {
        continue;
      }
      for (const t of tableList) {
        if (flat.length >= MAX_TABLES_NAMES) break;
        flat.push({ catalog, schema_name: schema, name: t.name });
      }
    }
  }

  if (flat.length === 0) return [];

  // ----- Phase 2: rank against the prompt + recent chat turns -------------
  const queryTokens = Array.from(
    new Set([
      ...tokenize(opts.prompt ?? ""),
      ...tokenize(opts.history ?? "").slice(0, 24),
    ]),
  );
  const ranked = rankTables(flat, queryTokens);
  const topForColumns = ranked.slice(0, MAX_TABLES_WITH_COLUMNS);

  // ----- Phase 3: hydrate columns for the top matches ---------------------
  const hydrated = await runWithConcurrency(
    topForColumns,
    async (t) => {
      const r = await qc.ensureQueryData({
        queryKey: ["columns", key, t.catalog, t.schema_name, t.name],
        queryFn: () =>
          api.listColumns(connection, t.catalog, t.schema_name, t.name),
      });
      return {
        catalog: t.catalog,
        schema_name: t.schema_name,
        name: t.name,
        columns: r.columns.slice(0, MAX_COLUMNS_PER_TABLE),
      } satisfies AIAvailableTable;
    },
    COLUMN_FETCH_CONCURRENCY,
  );

  const out: AIAvailableTable[] = hydrated.filter(
    (h): h is AIAvailableTable => !!h,
  );
  // Stitch in remaining table names without columns so the model still
  // sees them and can request more detail via CLARIFY if needed.
  const haveColumns = new Set(out.map((t) => `${t.catalog}.${t.schema_name}.${t.name}`));
  for (const t of ranked.slice(MAX_TABLES_WITH_COLUMNS)) {
    const id = `${t.catalog}.${t.schema_name}.${t.name}`;
    if (haveColumns.has(id)) continue;
    out.push({ catalog: t.catalog, schema_name: t.schema_name, name: t.name, columns: [] });
  }
  return out;
}

export function dialectFor(connection: Connection): string {
  return DIALECT_BY_CONNECTOR[connection.connector_type] ?? "ansi";
}
