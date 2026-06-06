"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, ScrollText, ShieldCheck, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStatus } from "@/hooks/use-auth";

const CARDS = [
  {
    href: "/settings/admin/ai",
    icon: KeyRound,
    title: "AI provider",
    blurb: "Pick OpenAI / Anthropic / Ollama / mock and store the keys server-side. Replaces .env for team setups.",
  },
  {
    href: "/settings/admin/users",
    icon: Users,
    title: "Users & invites",
    blurb: "See who has accounts on this instance and mint admin-only signup invites.",
  },
  {
    href: "/settings/admin/audit",
    icon: ScrollText,
    title: "Audit log",
    blurb: "Append-only log of auth + admin actions. Filter by user or event type.",
  },
];

export default function AdminOverviewPage() {
  const status = useAuthStatus();
  const users = useQuery({ queryKey: ["admin-users"], queryFn: api.adminListUsers });
  const invites = useQuery({
    queryKey: ["admin-invites"],
    queryFn: api.adminListInvites,
  });
  const recent = useQuery({
    queryKey: ["admin-audit-recent"],
    queryFn: () => api.adminListAudit({ limit: 5 }),
  });

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <ShieldCheck className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-balance text-xl font-semibold tracking-tightish">
            Admin settings
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure connections, AI keys, users, and audit visibility for
            your team instance from one place.
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Users"
          value={users.data?.length ?? "…"}
          hint={
            status.data?.auth_enabled ? "active accounts" : "single-user mode"
          }
        />
        <Stat
          label="Open invites"
          value={
            invites.data?.filter((i) => !i.accepted_at).length ?? "…"
          }
          hint="not yet accepted"
        />
        <Stat
          label="Recent events"
          value={recent.data?.events.length ?? "…"}
          hint="audit log entries"
        />
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        {CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.href}
              href={card.href}
              className="card-premium block p-4 transition-colors hover:bg-accent"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <Icon className="h-4 w-4 text-primary" />
                <div className="text-sm font-semibold">{card.title}</div>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {card.blurb}
              </p>
            </Link>
          );
        })}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint: string;
}) {
  return (
    <div className="card-premium p-3">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}
