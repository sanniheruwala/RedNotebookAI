"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronRight, Database, FolderTree, Loader2, RefreshCw, Search, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useConnectionStore } from "@/store/connection-store";
import { useNotebookStore } from "@/store/notebook-store";
import { api } from "@/lib/api";
import { connectionKey, isConfigured } from "@/lib/connection";
import type { Connection } from "@/lib/types";

export function MetadataExplorer() {
  const connection = useConnectionStore((s) => s.connection);
  const [filter, setFilter] = React.useState("");

  if (!isConfigured(connection)) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Database className="h-5 w-5 text-primary" />
        </div>
        <div className="mt-1 text-sm font-medium">Browse your data</div>
        <p className="text-balance text-xs leading-relaxed text-muted-foreground">
          Pick a connector (DuckDB, Trino, Postgres, MySQL, BigQuery, …) to
          browse catalogs, schemas, and tables.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter tables..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-7 border-none bg-transparent text-xs shadow-none focus-visible:ring-0"
        />
      </div>
      <ScrollArea className="scrollbar-thin flex-1 px-2 pb-4">
        <CatalogsList connection={connection} filter={filter} />
      </ScrollArea>
    </div>
  );
}

function CatalogsList({ connection, filter }: { connection: Connection; filter: string }) {
  const catalogs = useQuery({
    queryKey: ["catalogs", connectionKey(connection)],
    queryFn: () => api.listCatalogs(connection),
    enabled: isConfigured(connection),
  });

  if (catalogs.isPending) {
    return <Loading label="Loading catalogs..." />;
  }
  if (catalogs.error) {
    return <ErrorRow message={(catalogs.error as Error).message} onRetry={() => catalogs.refetch()} />;
  }

  const list = catalogs.data?.catalogs ?? [];
  if (!list.length) {
    return <EmptyRow message="No catalogs available on this connection." />;
  }

  // Single-catalog connectors (Postgres, MySQL, Snowflake, …) get the
  // catalog node auto-expanded — otherwise the user lands on one tiny
  // collapsed chevron and has to guess to click it before anything useful
  // shows up.
  const autoOpen = list.length === 1;
  return (
    <div className="space-y-0.5">
      {list.map((catalog) => (
        <CatalogNode
          key={catalog}
          connection={connection}
          catalog={catalog}
          filter={filter}
          defaultOpen={autoOpen}
        />
      ))}
    </div>
  );
}

function CatalogNode({
  connection,
  catalog,
  filter,
  defaultOpen = false,
}: {
  connection: Connection;
  catalog: string;
  filter: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div>
      <TreeRow icon={<Database className="h-3.5 w-3.5" />} open={open} onToggle={() => setOpen((o) => !o)}>
        {catalog}
      </TreeRow>
      {open && <SchemasList connection={connection} catalog={catalog} filter={filter} />}
    </div>
  );
}

function SchemasList({
  connection,
  catalog,
  filter,
}: {
  connection: Connection;
  catalog: string;
  filter: string;
}) {
  const schemas = useQuery({
    queryKey: ["schemas", connectionKey(connection), catalog],
    queryFn: () => api.listSchemas(connection, catalog),
  });

  if (schemas.isPending) return <Loading label="Loading schemas..." className="pl-6" />;
  if (schemas.error)
    return <ErrorRow className="pl-6" message={(schemas.error as Error).message} onRetry={() => schemas.refetch()} />;

  const list = schemas.data?.schemas ?? [];
  if (!list.length) {
    return <EmptyRow className="pl-6" message="No schemas in this catalog." />;
  }

  // Same idea as catalogs: auto-open the only schema (typical for SQLite
  // and many on-prem Postgres installs that only use `public`).
  const autoOpen = list.length === 1;
  return (
    <div className="ml-3 border-l">
      {list.map((schema) => (
        <SchemaNode
          key={schema}
          connection={connection}
          catalog={catalog}
          schema={schema}
          filter={filter}
          defaultOpen={autoOpen}
        />
      ))}
    </div>
  );
}

function SchemaNode({
  connection,
  catalog,
  schema,
  filter,
  defaultOpen = false,
}: {
  connection: Connection;
  catalog: string;
  schema: string;
  filter: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div>
      <TreeRow icon={<FolderTree className="h-3.5 w-3.5" />} open={open} onToggle={() => setOpen((o) => !o)} indent={1}>
        {schema}
      </TreeRow>
      {open && <TablesList connection={connection} catalog={catalog} schema={schema} filter={filter} />}
    </div>
  );
}

function TablesList({
  connection,
  catalog,
  schema,
  filter,
}: {
  connection: Connection;
  catalog: string;
  schema: string;
  filter: string;
}) {
  const tables = useQuery({
    queryKey: ["tables", connectionKey(connection), catalog, schema],
    queryFn: () => api.listTables(connection, catalog, schema),
  });
  const setSelected = useConnectionStore((s) => s.setSelected);
  const addCell = useNotebookStore((s) => s.addCell);
  const updateCell = useNotebookStore((s) => s.updateCell);

  if (tables.isPending) return <Loading label="Loading tables..." className="pl-10" />;
  if (tables.error)
    return <ErrorRow className="pl-10" message={(tables.error as Error).message} onRetry={() => tables.refetch()} />;

  const filtered = (tables.data?.tables ?? []).filter((t) =>
    filter ? t.name.toLowerCase().includes(filter.toLowerCase()) : true
  );

  const previewTable = (name: string) => {
    setSelected({ catalog, schema, table: name });
    const id = addCell("sql");
    updateCell(id, (cell) =>
      cell.cell_type === "sql"
        ? { ...cell, sql: `SELECT *\nFROM "${catalog}"."${schema}"."${name}"\nLIMIT 100` }
        : cell
    );
  };

  return (
    <div className="ml-4 space-y-0.5 py-1 pl-1">
      {filtered.map((t) => (
        <button
          key={t.name}
          onClick={() => previewTable(t.name)}
          className="group flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Table2 className="h-3.5 w-3.5" />
          <span className="truncate">{t.name}</span>
          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground/70 opacity-0 group-hover:opacity-100">
            preview
          </span>
        </button>
      ))}
      {!filtered.length && <div className="px-2 py-1 text-xs text-muted-foreground">No tables</div>}
    </div>
  );
}

function TreeRow({
  icon,
  open,
  onToggle,
  indent = 0,
  children,
}: {
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  indent?: number;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs font-medium hover:bg-accent"
      style={{ paddingLeft: `${0.5 + indent * 0.75}rem` }}
    >
      <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function Loading({ label, className }: { label: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground ${className ?? ""}`}>
      <Loader2 className="h-3 w-3 animate-spin" /> {label}
    </div>
  );
}

function ErrorRow({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 px-2 py-1 text-xs text-destructive ${className ?? ""}`}>
      <span className="truncate">{message}</span>
      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onRetry}>
        <RefreshCw className="h-3 w-3" />
      </Button>
    </div>
  );
}

function EmptyRow({ message, className }: { message: string; className?: string }) {
  return (
    <div className={`px-2 py-1 text-xs italic text-muted-foreground ${className ?? ""}`}>
      {message}
    </div>
  );
}
