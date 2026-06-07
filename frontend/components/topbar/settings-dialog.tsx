"use client";

import * as React from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Github,
  KeyRound,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import { useAuthStatus } from "@/hooks/use-auth";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ open, onOpenChange }: Props) {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    enabled: open,
    staleTime: 30_000,
  });
  const auth = useAuthStatus();

  const themes: { id: "light" | "dark" | "system"; label: string; icon: React.ReactNode }[] =
    [
      { id: "light", label: "Light", icon: <Sun className="h-3.5 w-3.5" /> },
      { id: "dark", label: "Dark", icon: <Moon className="h-3.5 w-3.5" /> },
      { id: "system", label: "System", icon: <Monitor className="h-3.5 w-3.5" /> },
    ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            App preferences and integration state. Connection-level settings
            live with each saved connection.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Appearance
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {themes.map((t) => {
              const active = (theme ?? "system") === t.id;
              return (
                <Button
                  key={t.id}
                  type="button"
                  variant={active ? "default" : "outline"}
                  size="sm"
                  className="h-9 justify-center gap-1.5"
                  onClick={() => setTheme(t.id)}
                >
                  {t.icon}
                  {t.label}
                </Button>
              );
            })}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Currently rendering in <span className="font-medium">{resolvedTheme}</span>.
          </div>
        </section>

        <section className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Backend
          </div>
          <Row label="Version" value={health.data?.version ?? "…"} />
          <Row
            label="AI provider"
            value={(() => {
              const configured = health.data?.ai_provider;
              const active = health.data?.ai_provider_active ?? "…";
              const mismatched =
                configured && configured !== "mock" && active === "mock";
              return (
                <span className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={`rounded-md font-mono text-[10px] ${
                      mismatched
                        ? "border-destructive/40 text-destructive"
                        : ""
                    }`}
                  >
                    {active}
                  </Badge>
                  {mismatched && (
                    <span className="text-[10px] text-destructive">
                      (configured: {configured}, fell back)
                    </span>
                  )}
                </span>
              );
            })()}
          />
          <Row
            label="Authentication"
            value={
              auth.data?.auth_enabled ? (
                <Badge
                  variant="outline"
                  className="rounded-md border-primary/30 bg-primary/10 text-[10px] text-primary"
                >
                  Enabled
                </Badge>
              ) : (
                <Badge variant="outline" className="rounded-md text-[10px]">
                  Single-user (laptop mode)
                </Badge>
              )
            }
          />
          {auth.data?.user && (
            <Row
              label="Signed in as"
              value={
                <span className="font-mono text-[10px]">
                  {auth.data.user.email}{" "}
                  {auth.data.user.is_admin && (
                    <ShieldCheck className="ml-0.5 inline h-3 w-3 text-primary" />
                  )}
                </span>
              }
            />
          )}
        </section>

        <section className="space-y-2">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Shortcuts
          </div>
          <div className="grid grid-cols-1 gap-1 text-[11px]">
            {/* Admin link: visible to admins, and to anyone in single-user
                mode (since the synthetic default user is admin). */}
            {(!auth.data?.auth_enabled || auth.data?.user?.is_admin) && (
              <Link
                href="/settings/admin"
                onClick={() => onOpenChange(false)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Admin settings
              </Link>
            )}
            <Link
              href="/settings/tokens"
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
            >
              <KeyRound className="h-3.5 w-3.5" /> Manage API tokens
            </Link>
            <a
              href="https://github.com/sanniheruwala/RedNotebookAI"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
            >
              <Github className="h-3.5 w-3.5" /> Source on GitHub
            </a>
            <a
              href="https://github.com/sanniheruwala/RedNotebookAI/tree/main/docs"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-foreground hover:bg-accent"
            >
              <BookOpen className="h-3.5 w-3.5" /> Documentation
            </a>
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  );
}
