"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Kbd } from "@/components/ui/kbd";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRequireAuth } from "@/hooks/use-auth";
import { api, HttpError } from "@/lib/api";
import type { APITokenCreated } from "@/lib/types";

export default function TokensPage() {
  const router = useRouter();
  const status = useRequireAuth();
  const qc = useQueryClient();
  const [newName, setNewName] = React.useState("");
  const [created, setCreated] = React.useState<APITokenCreated | null>(null);

  const list = useQuery({
    queryKey: ["api-tokens"],
    queryFn: api.listApiTokens,
    enabled: !!status.data?.authenticated || status.data?.auth_enabled === false,
  });

  const create = useMutation({
    mutationFn: () => api.createApiToken({ name: newName || "Unnamed token" }),
    onSuccess: (token) => {
      setCreated(token);
      setNewName("");
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
    },
    onError: (err: Error) =>
      toast.error(err instanceof HttpError ? err.message : "Create failed"),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiToken(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success("Token revoked");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const tokens = list.data ?? [];

  if (status.isPending) {
    return (
      <main className="app-mesh grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="app-mesh min-h-screen">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="mb-4 gap-1.5"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to notebook
        </Button>

        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
            <KeyRound className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-balance text-xl font-semibold tracking-tightish">
              API tokens
            </h1>
            <p className="text-sm text-muted-foreground">
              Personal access tokens for automation and CLI usage. Send as{" "}
              <Kbd>Authorization: Bearer rnt_…</Kbd>
            </p>
          </div>
        </header>

        <section className="card-premium mb-6 p-4">
          <Label htmlFor="token-name" className="text-xs">
            Create new token
          </Label>
          <div className="mt-1 flex gap-2">
            <Input
              id="token-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. CI deploy"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !create.isPending) {
                  e.preventDefault();
                  create.mutate();
                }
              }}
            />
            <Button onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Mint
            </Button>
          </div>
        </section>

        <section className="card-premium overflow-hidden">
          <div className="border-b bg-muted/30 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Your tokens
          </div>
          {list.isPending && (
            <div className="p-4 text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
            </div>
          )}
          {list.error && (
            <div className="p-4 text-xs text-destructive">
              {(list.error as Error).message}
            </div>
          )}
          {tokens.length === 0 && !list.isPending && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No tokens yet. Mint one above.
            </div>
          )}
          {tokens.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{t.name}</span>
                  {t.revoked_at && (
                    <Badge variant="destructive" className="text-[10px]">
                      Revoked
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                  <span>{t.prefix}…</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span>
                    {t.last_used_at
                      ? `Last used ${new Date(t.last_used_at).toLocaleDateString()}`
                      : "Never used"}
                  </span>
                </div>
              </div>
              {!t.revoked_at && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (window.confirm(`Revoke "${t.name}"?`)) revoke.mutate(t.id);
                  }}
                  className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Revoke
                </Button>
              )}
            </div>
          ))}
        </section>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Tokens are scoped to your account. Treat them like passwords.{" "}
          <Link
            href="/"
            className="font-medium text-foreground hover:text-primary"
          >
            Back to notebook
          </Link>
          .
        </p>
      </div>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy your new token</DialogTitle>
            <DialogDescription>
              This is the only time you&apos;ll see the full token. Store it in
              your secret manager.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all">
            {created?.plaintext}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (created?.plaintext) {
                  navigator.clipboard.writeText(created.plaintext);
                  toast.success("Copied to clipboard");
                }
              }}
              className="gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
