"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "@/lib/api";

export default function AdminAuditPage() {
  const [action, setAction] = React.useState("");
  const [userId, setUserId] = React.useState("");
  const [limit, setLimit] = React.useState(200);

  const events = useQuery({
    queryKey: ["admin-audit", { action, userId, limit }],
    queryFn: () =>
      api.adminListAudit({
        limit,
        action: action || undefined,
        user_id: userId || undefined,
      }),
    refetchInterval: 15_000,
  });

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <ScrollText className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-balance text-xl font-semibold tracking-tightish">
            Audit log
          </h1>
          <p className="text-sm text-muted-foreground">
            Append-only daily log. Auto-refreshes every 15s.
          </p>
        </div>
      </header>

      <section className="card-premium space-y-3 p-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Action</Label>
            <Input
              placeholder="auth.login"
              value={action}
              onChange={(e) => setAction(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">User id</Label>
            <Input
              placeholder="(any)"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Limit</Label>
            <Input
              type="number"
              min={1}
              max={1000}
              value={limit}
              onChange={(e) =>
                setLimit(Math.max(1, Math.min(1000, Number(e.target.value) || 200)))
              }
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={() => events.refetch()}
            className="gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </section>

      <section className="card-premium overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Events ({events.data?.events.length ?? 0})
          </div>
          {events.isFetching && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <ScrollArea className="scrollbar-thin max-h-[60vh]">
          <div className="divide-y">
            {(events.data?.events ?? []).map((evt, i) => (
              <div key={i} className="px-4 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      evt.ok
                        ? "text-[10px]"
                        : "border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
                    }
                  >
                    {evt.action}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {new Date(evt.ts).toLocaleString()}
                  </span>
                  {evt.user_email && (
                    <span className="text-muted-foreground">· {evt.user_email}</span>
                  )}
                  {evt.ip && (
                    <span className="font-mono text-[10px] text-muted-foreground/70">
                      · {evt.ip}
                    </span>
                  )}
                </div>
                {Object.keys(evt.details || {}).length > 0 && (
                  <pre className="mt-1 overflow-x-auto rounded bg-muted/30 p-1.5 font-mono text-[10px] text-muted-foreground">
                    {JSON.stringify(evt.details, null, 2)}
                  </pre>
                )}
              </div>
            ))}
            {!events.isPending && (events.data?.events.length ?? 0) === 0 && (
              <div className="p-4 text-center text-xs text-muted-foreground">
                No events match these filters.
              </div>
            )}
          </div>
        </ScrollArea>
      </section>
    </div>
  );
}
