"use client";

import * as React from "react";
import { Cloud, Sparkles } from "lucide-react";
import type {
  Connection,
  DuckDBConnection,
  SQLAlchemyConnection,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Branded quick-connect templates
//
// Each template is a one-click starting point for a popular hosted-Postgres
// provider — the user picks "Supabase," gets a half-filled form with the
// right port + SSL + username defaults, and only has to drop in the host
// and password. Saves five fields of fiddling per new connection.
//
// The set is deliberately scoped to the providers a startup analyst hits
// most often. Adding more is one entry in TEMPLATES below.
// ---------------------------------------------------------------------------

export type ConnectionTemplate = {
  id: string;
  label: string;
  shortLabel?: string;
  blurb: string;
  helpUrl: string;
  /** Tailwind class for the swatch tile (bg + text + ring). */
  tint: string;
  /** Small inline SVG/text wordmark — kept simple, no asset imports. */
  glyph: string;
  build(): Connection;
};

const SUPABASE: ConnectionTemplate = {
  id: "supabase",
  label: "Supabase",
  blurb: "Hosted Postgres — host ends in supabase.co",
  helpUrl:
    "https://supabase.com/docs/guides/database/connecting-to-postgres",
  tint: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/30",
  glyph: "SB",
  build: (): SQLAlchemyConnection => ({
    connector_type: "postgresql",
    connection_name: "supabase",
    host: "db.<project-ref>.supabase.co",
    port: 5432,
    database: "postgres",
    username: "postgres",
    password: "",
    schema: "public",
    query_timeout_seconds: 300,
    max_result_rows: 10_000,
    connect_args: { sslmode: "require" },
    url_params: { sslmode: "require" },
  }),
};

const NEON: ConnectionTemplate = {
  id: "neon",
  label: "Neon",
  blurb: "Serverless Postgres — host ends in neon.tech",
  helpUrl: "https://neon.tech/docs/connect/connect-from-any-app",
  tint: "bg-lime-500/10 text-lime-300 ring-lime-500/30",
  glyph: "NE",
  build: (): SQLAlchemyConnection => ({
    connector_type: "postgresql",
    connection_name: "neon",
    host: "ep-<endpoint>.neon.tech",
    port: 5432,
    database: "neondb",
    username: "",
    password: "",
    schema: "public",
    query_timeout_seconds: 300,
    max_result_rows: 10_000,
    connect_args: { sslmode: "require" },
    url_params: { sslmode: "require" },
  }),
};

const VERCEL_POSTGRES: ConnectionTemplate = {
  id: "vercel-postgres",
  label: "Vercel Postgres",
  shortLabel: "Vercel",
  blurb: "Vercel-hosted Postgres (Neon-backed)",
  helpUrl: "https://vercel.com/docs/storage/vercel-postgres/quickstart",
  tint: "bg-zinc-500/10 text-zinc-200 ring-zinc-500/30",
  glyph: "▲",
  build: (): SQLAlchemyConnection => ({
    connector_type: "postgresql",
    connection_name: "vercel-postgres",
    host: "ep-<endpoint>-pooler.vercel-storage.com",
    port: 5432,
    database: "verceldb",
    username: "default",
    password: "",
    schema: "public",
    query_timeout_seconds: 300,
    max_result_rows: 10_000,
    connect_args: { sslmode: "require" },
    url_params: { sslmode: "require" },
  }),
};

const RAILWAY: ConnectionTemplate = {
  id: "railway",
  label: "Railway",
  blurb: "Postgres / MySQL on Railway",
  helpUrl: "https://docs.railway.com/guides/postgresql",
  tint: "bg-violet-500/10 text-violet-300 ring-violet-500/30",
  glyph: "RW",
  build: (): SQLAlchemyConnection => ({
    connector_type: "postgresql",
    connection_name: "railway",
    host: "containers-us-west-XX.railway.app",
    port: 5432,
    database: "railway",
    username: "postgres",
    password: "",
    schema: "public",
    query_timeout_seconds: 300,
    max_result_rows: 10_000,
    connect_args: { sslmode: "require" },
    url_params: { sslmode: "require" },
  }),
};

const RENDER: ConnectionTemplate = {
  id: "render",
  label: "Render",
  blurb: "Render-managed Postgres",
  helpUrl: "https://render.com/docs/databases#connecting-to-your-database",
  tint: "bg-sky-500/10 text-sky-300 ring-sky-500/30",
  glyph: "RE",
  build: (): SQLAlchemyConnection => ({
    connector_type: "postgresql",
    connection_name: "render",
    host: "<region>-postgres.render.com",
    port: 5432,
    database: "",
    username: "",
    password: "",
    schema: "public",
    query_timeout_seconds: 300,
    max_result_rows: 10_000,
    connect_args: { sslmode: "require" },
    url_params: { sslmode: "require" },
  }),
};

const HEROKU: ConnectionTemplate = {
  id: "heroku",
  label: "Heroku Postgres",
  shortLabel: "Heroku",
  blurb: "Heroku-managed Postgres",
  helpUrl: "https://devcenter.heroku.com/articles/heroku-postgresql",
  tint: "bg-purple-500/10 text-purple-300 ring-purple-500/30",
  glyph: "HK",
  build: (): SQLAlchemyConnection => ({
    connector_type: "postgresql",
    connection_name: "heroku",
    host: "ec2-<host>.compute-1.amazonaws.com",
    port: 5432,
    database: "",
    username: "",
    password: "",
    schema: "public",
    query_timeout_seconds: 300,
    max_result_rows: 10_000,
    connect_args: { sslmode: "require" },
    url_params: { sslmode: "require" },
  }),
};

const DUCKDB_LOCAL: ConnectionTemplate = {
  id: "duckdb-local",
  label: "DuckDB local",
  blurb: "In-memory — query CSV / Parquet without a server",
  helpUrl: "https://duckdb.org/docs/connect/overview",
  tint: "bg-amber-500/10 text-amber-300 ring-amber-500/30",
  glyph: "🦆",
  build: (): DuckDBConnection => ({
    connector_type: "duckdb",
    connection_name: "duckdb-local",
    database: ":memory:",
    read_only: false,
    working_dir: null,
    max_result_rows: 10_000,
  }),
};

export const CONNECTION_TEMPLATES: readonly ConnectionTemplate[] = [
  DUCKDB_LOCAL,
  SUPABASE,
  NEON,
  VERCEL_POSTGRES,
  RAILWAY,
  RENDER,
  HEROKU,
];

// ---------------------------------------------------------------------------
// Quick-connect strip rendered above the full connector grid in the dialog
// ---------------------------------------------------------------------------
export function QuickConnectStrip({
  onPick,
}: {
  onPick: (template: ConnectionTemplate) => void;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> Quick connect
        </div>
        <div className="text-[10px] text-muted-foreground/70">
          Pre-filled for popular providers
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {CONNECTION_TEMPLATES.map((t) => (
          <TemplateTile key={t.id} template={t} onPick={() => onPick(t)} />
        ))}
      </div>
    </section>
  );
}

function TemplateTile({
  template,
  onPick,
}: {
  template: ConnectionTemplate;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={template.blurb}
      className="group relative flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-left text-xs transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
    >
      <span
        aria-hidden
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-md text-[10px] font-bold tracking-tight ring-1 ${template.tint}`}
      >
        {template.glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium leading-snug text-foreground">
          {template.shortLabel ?? template.label}
        </span>
        <span className="block truncate text-[10px] text-muted-foreground/80">
          {template.blurb}
        </span>
      </span>
      <Cloud
        aria-hidden
        className="h-3 w-3 shrink-0 text-muted-foreground/40 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
