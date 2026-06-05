"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
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
import { useConnectionStore } from "@/store/connection-store";
import { api } from "@/lib/api";
import type { TrinoConnection } from "@/lib/types";

export function ConnectionDialog({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const stored = useConnectionStore((s) => s.connection);
  const setConnection = useConnectionStore((s) => s.setConnection);
  const [draft, setDraft] = React.useState<TrinoConnection>(stored as TrinoConnection);

  React.useEffect(() => {
    if (stored) setDraft(stored);
  }, [stored, open]);

  const testMutation = useMutation({
    mutationFn: () => api.testConnection(draft),
    onSuccess: (res) => {
      if (res.ok) toast.success(`Connected (${(res.duration_seconds ?? 0).toFixed(2)}s)`);
      else toast.error(res.message);
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  const save = () => {
    setConnection(draft);
    toast.success("Connection saved");
    setOpen(false);
  };

  function update<K extends keyof TrinoConnection>(key: K, value: TrinoConnection[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Trino connection</DialogTitle>
          <DialogDescription>
            Configure HTTPS access to your Trino cluster. Credentials are kept in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Connection name">
            <Input value={draft.connection_name} onChange={(e) => update("connection_name", e.target.value)} />
          </Field>
          <Field label="Scheme">
            <Input value={draft.scheme} onChange={(e) => update("scheme", e.target.value as "https")} />
          </Field>
          <Field label="Host" className="col-span-2">
            <Input value={draft.host} onChange={(e) => update("host", e.target.value)} placeholder="trino.example.com" />
          </Field>
          <Field label="Port">
            <Input
              type="number"
              value={draft.port}
              onChange={(e) => update("port", Number(e.target.value) || 443)}
            />
          </Field>
          <Field label="User">
            <Input value={draft.user} onChange={(e) => update("user", e.target.value)} />
          </Field>
          <Field label="Password / token" className="col-span-2">
            <Input
              type="password"
              value={draft.password ?? ""}
              onChange={(e) => update("password", e.target.value)}
            />
          </Field>
          <Field label="Default catalog">
            <Input value={draft.catalog ?? ""} onChange={(e) => update("catalog", e.target.value)} />
          </Field>
          <Field label="Default schema">
            <Input value={draft.schema ?? ""} onChange={(e) => update("schema", e.target.value)} />
          </Field>
          <Field label="Query timeout (s)">
            <Input
              type="number"
              value={draft.query_timeout_seconds ?? 300}
              onChange={(e) => update("query_timeout_seconds", Number(e.target.value) || 300)}
            />
          </Field>
          <Field label="Max result rows">
            <Input
              type="number"
              value={draft.max_result_rows ?? 10000}
              onChange={(e) => update("max_result_rows", Number(e.target.value) || 10000)}
            />
          </Field>
          <div className="col-span-2 flex items-center gap-2">
            <Switch
              id="verify"
              checked={draft.verify_ssl ?? true}
              onCheckedChange={(v) => update("verify_ssl", v)}
            />
            <Label htmlFor="verify">Verify SSL</Label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => testMutation.mutate()} disabled={testMutation.isPending}>
            {testMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : testMutation.data?.ok ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            ) : testMutation.data && !testMutation.data.ok ? (
              <XCircle className="h-4 w-4 text-destructive" />
            ) : null}
            Test connection
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
