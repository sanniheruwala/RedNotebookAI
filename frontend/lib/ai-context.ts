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

// Cap how much we ship to the LLM. Each table is ~600 tokens with 20 columns;
// 25 tables ≈ 15k tokens, which fits the existing 8000-char payload budget
// after JSON stringification.
const MAX_TABLES = 25;
const MAX_COLUMNS_PER_TABLE = 30;

/**
 * Discover the catalog/schema/table layout of the active connection so the
 * SQL generator can pick the right identifiers instead of hallucinating.
 *
 * Reuses the react-query cache used by the metadata explorer — no extra
 * round-trips if the user has already browsed the sidebar.
 *
 * Bounded for token cost: at most {@link MAX_TABLES} tables and
 * {@link MAX_COLUMNS_PER_TABLE} columns each, picking schemas the user has
 * highlighted in the explorer first.
 */
export async function loadAvailableTables(
  qc: QueryClient,
  connection: Connection,
  preferred: { catalog?: string | null; schema?: string | null } = {},
): Promise<AIAvailableTable[]> {
  const key = connectionKey(connection);
  const catalogs = await qc.ensureQueryData({
    queryKey: ["catalogs", key],
    queryFn: () => api.listCatalogs(connection),
  });
  const catalogList = catalogs.catalogs.slice();
  if (preferred.catalog && catalogList.includes(preferred.catalog)) {
    catalogList.sort((a, b) =>
      a === preferred.catalog ? -1 : b === preferred.catalog ? 1 : 0,
    );
  }

  const tables: AIAvailableTable[] = [];
  for (const catalog of catalogList) {
    if (tables.length >= MAX_TABLES) break;
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
    if (preferred.schema && schemas.includes(preferred.schema)) {
      schemas.sort((a, b) =>
        a === preferred.schema ? -1 : b === preferred.schema ? 1 : 0,
      );
    }

    for (const schema of schemas) {
      if (tables.length >= MAX_TABLES) break;
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
        if (tables.length >= MAX_TABLES) break;
        let cols: ColumnInfo[] = [];
        try {
          const r = await qc.ensureQueryData({
            queryKey: ["columns", key, catalog, schema, t.name],
            queryFn: () => api.listColumns(connection, catalog, schema, t.name),
          });
          cols = r.columns.slice(0, MAX_COLUMNS_PER_TABLE);
        } catch {
          // Skip tables we can't introspect — better to omit than mislead
          // the model with a name and no columns.
          continue;
        }
        tables.push({
          catalog,
          schema_name: schema,
          name: t.name,
          columns: cols,
        });
      }
    }
  }
  return tables;
}

export function dialectFor(connection: Connection): string {
  return DIALECT_BY_CONNECTOR[connection.connector_type] ?? "ansi";
}
