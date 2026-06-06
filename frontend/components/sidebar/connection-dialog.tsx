"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  Cloud,
  Database,
  Loader2,
  Save,
  Trash2,
  Upload,
  XCircle,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  defaultDuckDBConnection,
  defaultTrinoConnection,
  useConnectionStore,
} from "@/store/connection-store";
import { api } from "@/lib/api";
import { useAuthStatus } from "@/hooks/use-auth";
import { connectionLabel } from "@/lib/connection";
import type {
  Connection,
  DuckDBConnection,
  SavedConnection,
  TrinoConnection,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function ConnectionDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const stored = useConnectionStore((s) => s.connection);
  const setConnection = useConnectionStore((s) => s.setConnection);

  // Local working copies so the user can flip between Trino/DuckDB tabs
  // without losing the fields they've typed into the other one.
  const [trino, setTrino] = React.useState<TrinoConnection>(
    stored?.connector_type === "trino"
      ? (stored as TrinoConnection)
      : defaultTrinoConnection
  );
  const [duckdb, setDuckdb] = React.useState<DuckDBConnection>(
    stored?.connector_type === "duckdb"
      ? (stored as DuckDBConnection)
      : defaultDuckDBConnection
  );
  const [activeType, setActiveType] = React.useState<"trino" | "duckdb">(
    stored?.connector_type === "duckdb" ? "duckdb" : "trino"
  );

  React.useEffect(() => {
    if (!open || !stored) return;
    if (stored.connector_type === "trino") setTrino(stored);
    if (stored.connector_type === "duckdb") setDuckdb(stored);
    setActiveType(stored.connector_type);
  }, [open, stored]);

  const draft: Connection = activeType === "duckdb" ? duckdb : trino;

  // ----- Server-stored connections (only available with auth) -----------
  const auth = useAuthStatus();
  const qc = useQueryClient();
  const serverStorageOn = !!auth.data?.auth_enabled;

  const saved = useQuery({
    queryKey: ["saved-connections"],
    queryFn: api.listSavedConnections,
    enabled: open && serverStorageOn,
  });

  const persist = useMutation({
    mutationFn: () =>
      api.createSavedConnection({
        name: draft.connection_name || "Untitled connection",
        config: draft,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-connections"] });
      toast.success("Saved to your connections");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loadFromServer = useMutation({
    mutationFn: (id: string) => api.loadSavedConnection(id),
    onSuccess: (cfg) => {
      if (cfg.connector_type === "duckdb") {
        setDuckdb(cfg);
        setActiveType("duckdb");
      } else {
        setTrino(cfg);
        setActiveType("trino");
      }
      toast.success("Loaded");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeFromServer = useMutation({
    mutationFn: (id: string) => api.deleteSavedConnection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["saved-connections"] });
      toast.success("Removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testMutation = useMutation({
    mutationFn: () => api.testConnection(draft),
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(`Connected (${(res.duration_seconds ?? 0).toFixed(2)}s)`);
      } else {
        toast.error(res.message);
      }
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const save = () => {
    setConnection(draft);
    toast.success("Connection saved");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Connection</DialogTitle>
          <DialogDescription>
            Pick a connector. Credentials are kept in your browser; in
            multi-user mode connections are stored server-side and admin-only.
          </DialogDescription>
        </DialogHeader>

        {serverStorageOn && (
          <SavedConnectionsPanel
            saved={saved.data ?? []}
            loading={saved.isPending}
            onLoad={(id) => loadFromServer.mutate(id)}
            onDelete={(id) => {
              if (window.confirm("Delete this saved connection?")) {
                removeFromServer.mutate(id);
              }
            }}
            loadingId={
              loadFromServer.isPending ? loadFromServer.variables ?? null : null
            }
          />
        )}

        <Tabs
          value={activeType}
          onValueChange={(v) => setActiveType(v as "trino" | "duckdb")}
        >
          <TabsList className="grid w-full grid-cols-2 bg-muted/40 p-0.5">
            <TabsTrigger value="duckdb" className="gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" /> DuckDB (no server)
            </TabsTrigger>
            <TabsTrigger value="trino" className="gap-1.5 text-xs">
              <Database className="h-3.5 w-3.5" /> Trino
            </TabsTrigger>
          </TabsList>

          <TabsContent value="duckdb" className="mt-3">
            <DuckDBForm value={duckdb} onChange={setDuckdb} />
          </TabsContent>

          <TabsContent value="trino" className="mt-3">
            <TrinoForm value={trino} onChange={setTrino} />
          </TabsContent>
        </Tabs>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => testMutation.mutate()}
            disabled={testMutation.isPending}
          >
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : testMutation.data?.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : testMutation.data && !testMutation.data.ok ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : null}
            Test
          </Button>
          {serverStorageOn && (
            <Button
              variant="outline"
              onClick={() => persist.mutate()}
              disabled={persist.isPending}
              className="gap-1.5"
            >
              {persist.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Cloud className="h-4 w-4" />
              )}
              Save to my connections
            </Button>
          )}
          <Button onClick={save} className="gap-1.5">
            <Save className="h-4 w-4" /> Use
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SavedConnectionsPanel({
  saved,
  loading,
  onLoad,
  onDelete,
  loadingId,
}: {
  saved: SavedConnection[];
  loading: boolean;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  loadingId: string | null;
}) {
  return (
    <section className="mb-2 rounded-xl border bg-muted/20">
      <div className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <Cloud className="h-3 w-3" /> Your saved connections
        </div>
        <span className="text-[10px] text-muted-foreground">
          encrypted on the server
        </span>
      </div>
      {loading && (
        <div className="p-3 text-xs text-muted-foreground">
          <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
        </div>
      )}
      {!loading && saved.length === 0 && (
        <div className="p-3 text-xs text-muted-foreground">
          None yet. Fill in the form below and click{" "}
          <span className="font-medium text-foreground">
            Save to my connections
          </span>{" "}
          to add one.
        </div>
      )}
      {!loading &&
        saved.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 border-t px-3 py-1.5 first:border-t-0"
          >
            <button
              type="button"
              onClick={() => onLoad(c.id)}
              disabled={loadingId === c.id}
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs hover:text-primary"
            >
              {c.connector_type === "duckdb" ? (
                <Zap className="h-3 w-3 text-primary" />
              ) : (
                <Database className="h-3 w-3 text-primary" />
              )}
              <span className="truncate font-medium">{c.name}</span>
              <Badge variant="outline" className="ml-auto text-[10px]">
                {c.connector_type}
              </Badge>
              {c.last_tested_at &&
                (c.last_test_ok ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-destructive" />
                ))}
            </button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6"
              onClick={() => onLoad(c.id)}
              disabled={loadingId === c.id}
              aria-label="Load"
            >
              {loadingId === c.id ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Upload className="h-3 w-3" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 text-muted-foreground hover:text-destructive"
              onClick={() => onDelete(c.id)}
              aria-label="Delete"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
    </section>
  );
}

// ----- Sub-forms -----------------------------------------------------------
function TrinoForm({
  value,
  onChange,
}: {
  value: TrinoConnection;
  onChange: (next: TrinoConnection) => void;
}) {
  function update<K extends keyof TrinoConnection>(
    key: K,
    val: TrinoConnection[K]
  ) {
    onChange({ ...value, [key]: val });
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Connection name">
        <Input
          value={value.connection_name}
          onChange={(e) => update("connection_name", e.target.value)}
        />
      </Field>
      <Field label="Scheme">
        <Input
          value={value.scheme}
          onChange={(e) => update("scheme", e.target.value as "https")}
        />
      </Field>
      <Field label="Host" className="col-span-2">
        <Input
          value={value.host}
          onChange={(e) => update("host", e.target.value)}
          placeholder="trino.example.com"
        />
      </Field>
      <Field label="Port">
        <Input
          type="number"
          value={value.port}
          onChange={(e) => update("port", Number(e.target.value) || 443)}
        />
      </Field>
      <Field label="User">
        <Input
          value={value.user}
          onChange={(e) => update("user", e.target.value)}
        />
      </Field>
      <Field label="Password / token" className="col-span-2">
        <Input
          type="password"
          value={value.password ?? ""}
          onChange={(e) => update("password", e.target.value)}
        />
      </Field>
      <Field label="Default catalog">
        <Input
          value={value.catalog ?? ""}
          onChange={(e) => update("catalog", e.target.value)}
        />
      </Field>
      <Field label="Default schema">
        <Input
          value={value.schema ?? ""}
          onChange={(e) => update("schema", e.target.value)}
        />
      </Field>
      <Field label="Query timeout (s)">
        <Input
          type="number"
          value={value.query_timeout_seconds ?? 300}
          onChange={(e) =>
            update("query_timeout_seconds", Number(e.target.value) || 300)
          }
        />
      </Field>
      <Field label="Max result rows">
        <Input
          type="number"
          value={value.max_result_rows ?? 10000}
          onChange={(e) =>
            update("max_result_rows", Number(e.target.value) || 10000)
          }
        />
      </Field>
      <div className="col-span-2 flex items-center gap-2">
        <Switch
          id="verify"
          checked={value.verify_ssl ?? true}
          onCheckedChange={(v) => update("verify_ssl", v)}
        />
        <Label htmlFor="verify">Verify SSL</Label>
      </div>
    </div>
  );
}

function DuckDBForm({
  value,
  onChange,
}: {
  value: DuckDBConnection;
  onChange: (next: DuckDBConnection) => void;
}) {
  function update<K extends keyof DuckDBConnection>(
    key: K,
    val: DuckDBConnection[K]
  ) {
    onChange({ ...value, [key]: val });
  }
  const inMemory = value.database === ":memory:";
  return (
    <div className="space-y-3">
      <p className="rounded-md border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
        DuckDB is embedded: zero server, zero credentials. Use{" "}
        <span className="font-mono">:memory:</span> for an ephemeral playground
        (great for{" "}
        <span className="font-mono">read_csv_auto(&apos;orders.csv&apos;)</span>),
        or point at a <span className="font-mono">.duckdb</span> file for
        persistent state.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Connection name">
          <Input
            value={value.connection_name}
            onChange={(e) => update("connection_name", e.target.value)}
          />
        </Field>
        <Field label="Max result rows">
          <Input
            type="number"
            value={value.max_result_rows ?? 10000}
            onChange={(e) =>
              update("max_result_rows", Number(e.target.value) || 10000)
            }
          />
        </Field>
        <div className="col-span-2 flex items-center gap-2">
          <Switch
            id="inmem"
            checked={inMemory}
            onCheckedChange={(v) =>
              update("database", v ? ":memory:" : "./local.duckdb")
            }
          />
          <Label htmlFor="inmem">In-memory (ephemeral)</Label>
        </div>
        {!inMemory && (
          <Field label="Database file path" className="col-span-2">
            <Input
              value={value.database}
              onChange={(e) => update("database", e.target.value)}
              placeholder="./local.duckdb"
            />
          </Field>
        )}
        <Field label="Working directory (for relative file paths)" className="col-span-2">
          <Input
            value={value.working_dir ?? ""}
            onChange={(e) => update("working_dir", e.target.value || null)}
            placeholder="/path/to/data"
          />
        </Field>
        <div className="col-span-2 flex items-center gap-2">
          <Switch
            id="ro"
            checked={value.read_only ?? false}
            onCheckedChange={(v) => update("read_only", v)}
          />
          <Label htmlFor="ro">Read-only</Label>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
