/**
 * Connection helpers that abstract over every connector shape so UI
 * components don't have to discriminate every time they need a label.
 */
import type { Connection, SQLAlchemyConnection, TrinoConnection } from "./types";

/** Is this connection minimally ready to issue queries with? */
export function isConfigured(
  c: Connection | null | undefined
): c is Connection {
  if (!c) return false;
  if (c.connector_type === "duckdb") return true; // embedded; always works
  if (c.connector_type === "sqlite") return !!c.database;
  if (c.connector_type === "trino") return !!c.host && !!c.user;
  if (c.connector_type === "bigquery") {
    return !!(c as Connection & { project?: string }).project;
  }
  if (c.connector_type === "snowflake") {
    return !!(c as Connection & { account?: string }).account && !!c.username;
  }
  if (c.connector_type === "databricks") {
    return (
      !!c.host &&
      !!(c as Connection & { http_path?: string }).http_path &&
      !!(c as Connection & { access_token?: string }).access_token
    );
  }
  return !!c.host && !!c.username;
}

/** Short, human-readable identifier suitable for chips / status rows. */
export function connectionLabel(c: Connection | null | undefined): string {
  if (!c) return "Not configured";
  if (c.connector_type === "duckdb") {
    if (c.database === ":memory:") return "DuckDB · in-memory";
    const base = c.database.split(/[\\/]/).pop() || c.database;
    return `DuckDB · ${base}`;
  }
  if (c.connector_type === "trino") {
    return c.host || "Trino not configured";
  }
  if (c.connector_type === "sqlite") {
    if (c.database === ":memory:") return "SQLite · in-memory";
    const base = (c.database ?? "").split(/[\\/]/).pop() || c.database || "";
    return `SQLite · ${base}`;
  }
  if (c.connector_type === "snowflake") {
    const account = (c as Connection & { account?: string }).account;
    return account ? `Snowflake · ${account}` : "Snowflake not configured";
  }
  if (c.connector_type === "bigquery") {
    const project = (c as Connection & { project?: string }).project;
    return project ? `BigQuery · ${project}` : "BigQuery not configured";
  }
  if (c.connector_type === "databricks") {
    return c.host
      ? `Databricks · ${c.host.split(".")[0]}`
      : "Databricks not configured";
  }
  const host = c.host || "";
  return host
    ? `${prettyName(c.connector_type)} · ${host}`
    : `${prettyName(c.connector_type)} not configured`;
}

function prettyName(id: string): string {
  return (
    {
      postgresql: "PostgreSQL",
      mysql: "MySQL",
      mariadb: "MariaDB",
      mssql: "SQL Server",
      redshift: "Redshift",
      oracle: "Oracle",
      clickhouse: "ClickHouse",
    } as Record<string, string>
  )[id] ?? id;
}

/** Stable key for TanStack Query cache busting when the connection changes. */
export function connectionKey(c: Connection | null | undefined): string {
  if (!c) return "none";
  if (c.connector_type === "duckdb") {
    return `duckdb:${c.database}:${c.working_dir ?? ""}`;
  }
  if (c.connector_type === "trino") {
    const t = c as TrinoConnection;
    return `trino:${t.host}:${t.user}:${t.catalog ?? ""}:${t.schema ?? ""}`;
  }
  const sa = c as SQLAlchemyConnection;
  return `${c.connector_type}:${sa.host ?? ""}:${sa.database ?? ""}:${
    sa.username ?? ""
  }:${sa.schema ?? ""}`;
}
