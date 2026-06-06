"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  Database,
  Loader2,
  PlugZap,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ConnectionDialog } from "@/components/sidebar/connection-dialog";
import { CONNECTORS } from "@/lib/connectors";
import { connectionLabel, isConfigured } from "@/lib/connection";
import { useConnectionStore } from "@/store/connection-store";
import { api } from "@/lib/api";

/**
 * Topbar control for picking the active connection. Lists saved
 * connections in a dropdown for fast switching, plus a 'Manage…' item
 * that opens the full dialog for add / edit / delete.
 */
export function ConnectionPicker() {
  const connection = useConnectionStore((s) => s.connection);
  const activeId = useConnectionStore((s) => s.activeConnectionId);
  const setConnection = useConnectionStore((s) => s.setConnection);
  const setActiveId = useConnectionStore((s) => s.setActiveConnectionId);
  const qc = useQueryClient();

  const saved = useQuery({
    queryKey: ["saved-connections"],
    queryFn: api.listSavedConnections,
  });

  const switchTo = useMutation({
    mutationFn: (id: string) => api.loadSavedConnection(id),
    onSuccess: (cfg, id) => {
      setConnection(cfg);
      setActiveId(id);
      qc.invalidateQueries({ queryKey: ["query-metadata"] });
      toast.success("Switched connection");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const connected = isConfigured(connection);
  const label = connectionLabel(connection);
  const records = saved.data ?? [];

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" className="h-8 gap-1.5">
            <Database className="h-3.5 w-3.5" />
            <span className="max-w-[14ch] truncate text-xs">
              {connected ? label : "Pick connection"}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[18rem]">
          <DropdownMenuLabel className="text-[10px] uppercase tracking-[0.18em]">
            Saved connections
          </DropdownMenuLabel>
          {saved.isPending && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Loading…
            </div>
          )}
          {!saved.isPending && records.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">
              None saved yet. Add one below.
            </div>
          )}
          {records.map((c) => {
            const meta = CONNECTORS.find((m) => m.id === c.connector_type);
            const Icon = meta?.icon ?? Database;
            return (
              <DropdownMenuItem
                key={c.id}
                disabled={switchTo.isPending}
                onSelect={() => switchTo.mutate(c.id)}
                className="gap-2 text-xs"
              >
                <span
                  className={`grid h-5 w-5 place-items-center rounded ring-1 ${
                    meta?.tint ??
                    "bg-muted text-muted-foreground ring-border"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                </span>
                <span className="truncate font-medium">{c.name}</span>
                {activeId === c.id && (
                  <span className="ml-auto text-[10px] font-semibold text-primary">
                    Active
                  </span>
                )}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <ConnectionDialog>
            <DropdownMenuItem
              onSelect={(e) => e.preventDefault()}
              className="gap-2 text-xs"
            >
              <Settings2 className="h-3 w-3" /> Manage connections…
            </DropdownMenuItem>
          </ConnectionDialog>
          {records.length === 0 && (
            <ConnectionDialog>
              <DropdownMenuItem
                onSelect={(e) => e.preventDefault()}
                className="gap-2 text-xs text-primary"
              >
                <PlugZap className="h-3 w-3" /> Add your first connection
              </DropdownMenuItem>
            </ConnectionDialog>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
