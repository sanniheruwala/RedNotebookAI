"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2, Plus, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import type { InvitePublic } from "@/lib/types";

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const users = useQuery({
    queryKey: ["admin-users"],
    queryFn: api.adminListUsers,
  });
  const invites = useQuery({
    queryKey: ["admin-invites"],
    queryFn: api.adminListInvites,
  });

  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [created, setCreated] = React.useState<InvitePublic | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.adminCreateInvite({ email: email || null, role }),
    onSuccess: (invite) => {
      setCreated(invite);
      setEmail("");
      setRole("member");
      qc.invalidateQueries({ queryKey: ["admin-invites"] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const inviteUrl = (token: string) =>
    typeof window === "undefined"
      ? `/register?token=${token}`
      : `${window.location.origin}/register?token=${token}`;

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <Users className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-balance text-xl font-semibold tracking-tightish">
            Users &amp; invites
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage accounts on this instance. Invite tokens are one-time use
            and expire after 7 days.
          </p>
        </div>
      </header>

      <section className="card-premium overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Users ({users.data?.length ?? 0})
          </div>
        </div>
        {users.isPending && (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        )}
        {(users.data ?? []).length === 0 && !users.isPending && (
          <div className="p-4 text-xs text-muted-foreground">No users yet.</div>
        )}
        {(users.data ?? []).map((u) => (
          <div
            key={u.id}
            className="flex items-center justify-between gap-3 border-b px-4 py-2 last:border-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                {u.name}
                {u.is_admin && (
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                )}
                {!u.is_active && (
                  <Badge variant="destructive" className="text-[10px]">
                    Disabled
                  </Badge>
                )}
              </div>
              <div className="truncate text-[11px] text-muted-foreground">
                {u.email} · {u.provider}
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className="card-premium space-y-3 p-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Create invite
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="invite-email" className="text-xs">
              Email (optional)
            </Label>
            <Input
              id="invite-email"
              type="email"
              placeholder="alex@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="invite-role" className="text-xs">
              Role
            </Label>
            <Select
              id="invite-role"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "member")}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending}
            className="gap-1.5"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Mint invite
          </Button>
        </div>
      </section>

      <section className="card-premium overflow-hidden">
        <div className="border-b bg-muted/30 px-4 py-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Outstanding invites
        </div>
        {invites.isPending && (
          <div className="p-4 text-xs text-muted-foreground">Loading…</div>
        )}
        {(invites.data ?? []).length === 0 && !invites.isPending && (
          <div className="p-4 text-xs text-muted-foreground">
            No invites issued yet.
          </div>
        )}
        {(invites.data ?? []).map((i) => (
          <div
            key={i.token}
            className="flex items-center justify-between gap-3 border-b px-4 py-2 last:border-0"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-[11px]">{i.token.slice(0, 12)}…</span>
                <Badge variant="outline" className="text-[10px]">
                  {i.role}
                </Badge>
                {i.accepted_at && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-500"
                  >
                    Accepted
                  </Badge>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {i.email ?? "any email"} · expires{" "}
                {new Date(i.expires_at).toLocaleDateString()}
              </div>
            </div>
            {!i.accepted_at && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  navigator.clipboard.writeText(inviteUrl(i.token));
                  toast.success("Invite link copied");
                }}
                className="gap-1.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5" /> Copy link
              </Button>
            )}
          </div>
        ))}
      </section>

      <Dialog open={!!created} onOpenChange={(o) => !o && setCreated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite created</DialogTitle>
            <DialogDescription>
              Send this link to the invitee. It works once and expires in 7 days.
            </DialogDescription>
          </DialogHeader>
          {created && (
            <div className="rounded-lg border bg-muted/40 p-3 font-mono text-xs break-all">
              {inviteUrl(created.token)}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (created)
                  navigator.clipboard.writeText(inviteUrl(created.token));
                toast.success("Copied");
              }}
              className="gap-1.5"
            >
              <Copy className="h-3.5 w-3.5" /> Copy
            </Button>
            <Button onClick={() => setCreated(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
