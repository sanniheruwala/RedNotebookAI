"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  CloudOff,
  Loader2,
  Lock,
  PlugZap,
  Trash2,
  Upload,
  XCircle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  defaultDuckDBConnection,
  defaultTrinoConnection,
  useConnectionStore,
} from "@/store/connection-store";
import { api } from "@/lib/api";
import {
  CONNECTORS,
  type ConnectorId,
  type ConnectorMeta,
} from "@/lib/connectors";
import type {
  Connection,
  DuckDBConnection,
  SavedConnection,
  TrinoConnection,
} from "@/lib/types";

type View =
  | { kind: "list" }
  | { kind: "form"; connectorId: ConnectorId; editingId: string | null };

/**
 * Connection dialog — the one place to add, switch, edit, and delete the
 * connections this user can run queries against. Two views: a list of
 * saved connections plus an icon-grid picker for new ones, and a form
 * for the connector that was picked or selected for editing.
 *
 * Every saved connection lives encrypted on the server. The Zustand
 * active connection cache holds the decrypted payload only for the
 * lifetime of the page — switching connections is a load + replace.
 */
export function ConnectionDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [view, setView] = React.useState<View>({ kind: "list" });

  const setConnection = useConnectionStore((s) => s.setConnection);
  const setActiveId = useConnectionStore((s) => s.setActiveConnectionId);
  const activeId = useConnectionStore((s) => s.activeConnectionId);

  const qc = useQueryClient();
  const saved = useQuery({
    queryKey: ["saved-connections"],
    queryFn: api.listSavedConnections,
    enabled: open,
  });

  // ---- Draft state for the form view ---------------------------------------
  const [trinoDraft, setTrinoDraft] = React.useState<TrinoConnection>(
    defaultTrinoConnection
  );
  const [duckdbDraft, setDuckdbDraft] = React.useState<DuckDBConnection>(
    defaultDuckDBConnection
  );

  const currentDraft: Connection =
    view.kind === "form" && view.connectorId === "duckdb"
      ? duckdbDraft
      : trinoDraft;
  const setCurrentDraft = (next: Connection) => {
    if (next.connector_type === "duckdb") setDuckdbDraft(next);
    else setTrinoDraft(next);
  };

  // ---- Mutations ------------------------------------------------------------
  const create = useMutation({
    mutationFn: () =>
      api.createSavedConnection({
        name: currentDraft.connection_name || "Untitled connection",
        config: currentDraft,
      }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ["saved-connections"] });
      setConnection(currentDraft);
      setActiveId(record.id);
      toast.success("Connection saved and active");
      setView({ kind: "list" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const updateExisting = useMutation({
    mutationFn: (id: string) =>
      api.updateSavedConnection(id, {
        name: currentDraft.connection_name,
        config: currentDraft,
      }),
    onSuccess: (record) => {
      qc.invalidateQueries({ queryKey: ["saved-connections"] });
      if (activeId === record.id) {
        setConnection(currentDraft);
      }
      toast.success("Connection updated");
      setView({ kind: "list" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const loadAndActivate = useMutation({
    mutationFn: (id: string) => api.loadSavedConnection(id),
    onSuccess: (cfg, id) => {
      setConnection(cfg);
      setActiveId(id);
      toast.success("Switched connection");
      setOpen(false);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeOne = useMutation({
    mutationFn: (id: string) => api.deleteSavedConnection(id),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ["saved-connections"] });
      if (activeId === id) {
        setConnection(null);
        setActiveId(null);
      }
      toast.success("Connection deleted");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const testInline = useMutation({
    mutationFn: () => api.testConnection(currentDraft),
    onSuccess: (res) =>
      res.ok
        ? toast.success(`Connected (${(res.duration_seconds ?? 0).toFixed(2)}s)`)
        : toast.error(res.message),
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  // ---- View transitions -----------------------------------------------------
  const openAdd = (connectorId: ConnectorId) => {
    if (connectorId === "duckdb") setDuckdbDraft(defaultDuckDBConnection);
    else if (connectorId === "trino") setTrinoDraft(defaultTrinoConnection);
    setView({ kind: "form", connectorId, editingId: null });
  };

  const openEdit = async (record: SavedConnection) => {
    try {
      const cfg = await api.loadSavedConnection(record.id);
      if (cfg.connector_type === "duckdb") setDuckdbDraft(cfg);
      else setTrinoDraft(cfg);
      setView({
        kind: "form",
        connectorId: cfg.connector_type as ConnectorId,
        editingId: record.id,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const saveAndUse = () => {
    if (view.kind !== "form") return;
    view.editingId ? updateExisting.mutate(view.editingId) : create.mutate();
  };

  React.useEffect(() => {
    if (!open) setView({ kind: "list" });
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl">
        {view.kind === "list" ? (
          <ListView
            saved={saved.data ?? []}
            loading={saved.isPending}
            activeId={activeId}
            loadingId={
              loadAndActivate.isPending ? loadAndActivate.variables ?? null : null
            }
            onActivate={(id) => loadAndActivate.mutate(id)}
            onEdit={openEdit}
            onDelete={(id) => {
              if (window.confirm("Delete this saved connection?")) {
                removeOne.mutate(id);
              }
            }}
            onAdd={openAdd}
          />
        ) : (
          <FormView
            connectorId={view.connectorId}
            editing={view.editingId}
            value={currentDraft}
            onChange={setCurrentDraft}
            onBack={() => setView({ kind: "list" })}
            onSave={saveAndUse}
            onTest={() => testInline.mutate()}
            savePending={create.isPending || updateExisting.isPending}
            testPending={testInline.isPending}
            testResult={testInline.data ?? null}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// ===========================================================================
// View 1 — list of saved connections + icon grid to add a new one
// ===========================================================================
function ListView({
  saved,
  loading,
  activeId,
  loadingId,
  onActivate,
  onEdit,
  onDelete,
  onAdd,
}: {
  saved: SavedConnection[];
  loading: boolean;
  activeId: string | null;
  loadingId: string | null;
  onActivate: (id: string) => void;
  onEdit: (record: SavedConnection) => void;
  onDelete: (id: string) => void;
  onAdd: (id: ConnectorId) => void;
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <PlugZap className="h-4 w-4 text-primary" /> Connections
        </DialogTitle>
        <DialogDescription className="flex items-center gap-1.5 text-[11px]">
          <Lock className="h-3 w-3" /> Credentials encrypted on disk. Switch any
          time — multiple connections of the same type are fine.
        </DialogDescription>
      </DialogHeader>

      <section className="rounded-xl border bg-muted/20">
        <div className="border-b bg-muted/30 px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Your saved connections {saved.length > 0 && `(${saved.length})`}
        </div>
        {loading ? (
          <div className="p-3 text-xs text-muted-foreground">
            <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : saved.length === 0 ? (
          <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
            <CloudOff className="h-3.5 w-3.5" />
            None yet. Pick a connector below to add your first.
          </div>
        ) : (
          <ScrollArea className="max-h-60">
            <div className="divide-y">
              {saved.map((c) => (
                <SavedRow
                  key={c.id}
                  record={c}
                  active={c.id === activeId}
                  loading={loadingId === c.id}
                  onActivate={() => onActivate(c.id)}
                  onEdit={() => onEdit(c)}
                  onDelete={() => onDelete(c.id)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </section>

      <section className="space-y-2">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Add connection
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {CONNECTORS.map((c) => (
            <ConnectorTile key={c.id} meta={c} onPick={() => onAdd(c.id)} />
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">
          Greyed-out connectors land in v0.7. Trino and DuckDB are live today.
        </p>
      </section>
    </>
  );
}

function SavedRow({
  record,
  active,
  loading,
  onActivate,
  onEdit,
  onDelete,
}: {
  record: SavedConnection;
  active: boolean;
  loading: boolean;
  onActivate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const meta = CONNECTORS.find((m) => m.id === record.connector_type);
  const Icon = meta?.icon;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 text-xs ${
        active ? "bg-primary/5" : "bg-card"
      }`}
    >
      <span
        className={`grid h-7 w-7 place-items-center rounded-md ring-1 ${
          meta?.tint ?? "bg-muted text-muted-foreground ring-border"
        }`}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium">{record.name}</span>
          {active && (
            <Badge
              variant="outline"
              className="h-4 border-primary/40 bg-primary/10 px-1 text-[9px] font-semibold uppercase tracking-wider text-primary"
            >
              Active
            </Badge>
          )}
          {record.last_test_ok !== null &&
            (record.last_test_ok ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" />
            ) : (
              <XCircle className="h-3 w-3 text-destructive" />
            ))}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {record.connector_type} ·{" "}
          {record.host || record.catalog || "—"}
        </div>
      </div>
      {!active && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5"
          onClick={onActivate}
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          Use
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-[11px]"
        onClick={onEdit}
        aria-label="Edit"
      >
        Edit
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label="Delete"
      >
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function ConnectorTile({
  meta,
  onPick,
}: {
  meta: ConnectorMeta;
  onPick: () => void;
}) {
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={!meta.available}
      className={`group/tile relative flex flex-col items-start gap-1.5 rounded-xl border bg-card p-2.5 text-left transition-all hover:border-primary/40 hover:bg-accent/50 hover:shadow-sm ${
        !meta.available ? "opacity-50" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`grid h-7 w-7 place-items-center rounded-md ring-1 ${meta.tint}`}
        >
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-medium">{meta.label}</span>
        {meta.badge && (
          <Badge variant="outline" className="ml-auto h-4 px-1 text-[9px]">
            {meta.badge}
          </Badge>
        )}
      </div>
      <span className="text-[10px] leading-relaxed text-muted-foreground">
        {meta.tagline}
      </span>
      {!meta.available && (
        <span className="absolute right-2 top-2 text-[9px] uppercase tracking-wider text-muted-foreground">
          v0.7
        </span>
      )}
    </button>
  );
}

// ===========================================================================
// View 2 — form for a chosen connector
// ===========================================================================
function FormView({
  connectorId,
  editing,
  value,
  onChange,
  onBack,
  onSave,
  onTest,
  savePending,
  testPending,
  testResult,
}: {
  connectorId: ConnectorId;
  editing: string | null;
  value: Connection;
  onChange: (next: Connection) => void;
  onBack: () => void;
  onSave: () => void;
  onTest: () => void;
  savePending: boolean;
  testPending: boolean;
  testResult: { ok: boolean; message: string; duration_seconds?: number } | null;
}) {
  const meta = CONNECTORS.find((c) => c.id === connectorId)!;
  const Icon = meta.icon;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Back"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <span
            className={`grid h-7 w-7 place-items-center rounded-md ring-1 ${meta.tint}`}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          {editing ? "Edit" : "New"} {meta.label} connection
        </DialogTitle>
        <DialogDescription>{meta.tagline}</DialogDescription>
      </DialogHeader>

      {connectorId === "duckdb" && (
        <DuckDBForm
          value={value as DuckDBConnection}
          onChange={(v) => onChange(v)}
        />
      )}
      {connectorId === "trino" && (
        <TrinoForm
          value={value as TrinoConnection}
          onChange={(v) => onChange(v)}
        />
      )}

      <DialogFooter className="gap-2">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={savePending || testPending}
        >
          Cancel
        </Button>
        <Button
          variant="outline"
          onClick={onTest}
          disabled={testPending}
          className="gap-1.5"
        >
          {testPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : testResult?.ok ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          ) : testResult && !testResult.ok ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : null}
          Test
        </Button>
        <Button onClick={onSave} disabled={savePending} className="gap-1.5">
          {savePending && <Loader2 className="h-4 w-4 animate-spin" />}
          {editing ? "Save changes" : "Save & use"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ===========================================================================
// Per-connector sub-forms (unchanged shape from v0.5; just embedded here)
// ===========================================================================
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
        <Field
          label="Working directory (for relative file paths)"
          className="col-span-2"
        >
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
