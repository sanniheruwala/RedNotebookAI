/**
 * Central registry of every connector the UI knows about.
 *
 * The dialog's icon-grid picker reads from this list; adding a new connector
 * is one entry here + a form component + a backend connector class. Icon
 * tiles are Lucide glyphs for now; brand marks will replace them later
 * without touching call sites.
 */

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Cloud,
  Database,
  Disc3,
  Flame,
  HardDrive,
  Layers,
  ListTree,
  Server,
  Snowflake,
  Sparkles,
  Zap,
} from "lucide-react";
import type { Connection } from "@/lib/types";

export type ConnectorId =
  | "trino"
  | "duckdb"
  | "postgresql"
  | "mysql"
  | "mariadb"
  | "sqlite"
  | "mssql"
  | "snowflake"
  | "bigquery"
  | "redshift"
  | "oracle"
  | "clickhouse"
  | "databricks";

export type ConnectorMeta = {
  id: ConnectorId;
  label: string;
  /** One-line tagline shown under the connector name. */
  tagline: string;
  /** Pill shown on the card (e.g. "no server", "experimental"). */
  badge?: string;
  /** Whether this connector is wired up end-to-end on this build. */
  available: boolean;
  icon: LucideIcon;
  /** Tailwind classes for the icon tile background tint. */
  tint: string;
};

export const CONNECTORS: ConnectorMeta[] = [
  {
    id: "duckdb",
    label: "DuckDB",
    tagline: "Embedded analytical DB; query CSV / Parquet locally.",
    badge: "no server",
    available: true,
    icon: Zap,
    tint: "bg-amber-500/15 text-amber-500 ring-amber-500/30",
  },
  {
    id: "trino",
    label: "Trino",
    tagline: "Distributed SQL across data lakes and warehouses.",
    available: true,
    icon: Database,
    tint: "bg-emerald-500/15 text-emerald-500 ring-emerald-500/30",
  },
  {
    id: "postgresql",
    label: "PostgreSQL",
    tagline: "OSS relational database. Plays nice with everything.",
    available: false,
    icon: Disc3,
    tint: "bg-sky-500/15 text-sky-500 ring-sky-500/30",
  },
  {
    id: "mysql",
    label: "MySQL",
    tagline: "OSS relational database, MyISAM/InnoDB.",
    available: false,
    icon: Disc3,
    tint: "bg-orange-500/15 text-orange-500 ring-orange-500/30",
  },
  {
    id: "mariadb",
    label: "MariaDB",
    tagline: "OSS fork of MySQL.",
    available: false,
    icon: Disc3,
    tint: "bg-amber-700/15 text-amber-700 ring-amber-700/30",
  },
  {
    id: "sqlite",
    label: "SQLite",
    tagline: "File-based RDBMS. Zero-config.",
    badge: "no server",
    available: false,
    icon: HardDrive,
    tint: "bg-blue-500/15 text-blue-500 ring-blue-500/30",
  },
  {
    id: "mssql",
    label: "SQL Server",
    tagline: "Microsoft SQL Server.",
    available: false,
    icon: Server,
    tint: "bg-red-500/15 text-red-500 ring-red-500/30",
  },
  {
    id: "snowflake",
    label: "Snowflake",
    tagline: "Cloud data platform.",
    available: false,
    icon: Snowflake,
    tint: "bg-cyan-500/15 text-cyan-500 ring-cyan-500/30",
  },
  {
    id: "bigquery",
    label: "BigQuery",
    tagline: "Google Cloud serverless warehouse.",
    available: false,
    icon: Cloud,
    tint: "bg-indigo-500/15 text-indigo-500 ring-indigo-500/30",
  },
  {
    id: "redshift",
    label: "Redshift",
    tagline: "AWS columnar warehouse.",
    available: false,
    icon: Layers,
    tint: "bg-rose-500/15 text-rose-500 ring-rose-500/30",
  },
  {
    id: "oracle",
    label: "Oracle",
    tagline: "Oracle Database.",
    available: false,
    icon: BarChart3,
    tint: "bg-red-600/15 text-red-600 ring-red-600/30",
  },
  {
    id: "clickhouse",
    label: "ClickHouse",
    tagline: "OLAP, columnar, fast.",
    available: false,
    icon: Flame,
    tint: "bg-yellow-500/15 text-yellow-500 ring-yellow-500/30",
  },
  {
    id: "databricks",
    label: "Databricks",
    tagline: "Lakehouse SQL.",
    available: false,
    icon: Boxes,
    tint: "bg-orange-600/15 text-orange-600 ring-orange-600/30",
  },
];

export function getConnectorMeta(id: ConnectorId): ConnectorMeta {
  const meta = CONNECTORS.find((c) => c.id === id);
  if (!meta) throw new Error(`Unknown connector: ${id}`);
  return meta;
}

export function isConnectorAvailable(id: string): id is ConnectorId {
  const meta = CONNECTORS.find((c) => c.id === id);
  return !!meta?.available;
}

/** Convenience: keep the unused-import noise down for ConnectorMeta consumers. */
export type { Connection };
/** Re-exported for callers that just want the sparkle icon next to "Add". */
export const AddIcon: LucideIcon = Sparkles;
/** Re-exported for callers that just want the tree icon for saved entries. */
export const SavedTreeIcon: LucideIcon = ListTree;
