"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, KeyRound, Loader2, ScrollText, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRequireAdmin } from "@/hooks/use-auth";

const NAV = [
  { href: "/settings/admin", label: "Overview", icon: ShieldCheck },
  { href: "/settings/admin/ai", label: "AI provider", icon: KeyRound },
  { href: "/settings/admin/users", label: "Users & invites", icon: Users },
  { href: "/settings/admin/audit", label: "Audit log", icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const status = useRequireAdmin();
  const pathname = usePathname();
  const router = useRouter();

  if (status.isPending) {
    return (
      <main className="app-mesh grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (
    status.data?.auth_enabled &&
    (!status.data.authenticated || !status.data.user?.is_admin)
  ) {
    return (
      <main className="app-mesh grid min-h-screen place-items-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <main className="app-mesh min-h-screen">
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 md:flex-row">
        <aside className="md:w-56">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/")}
            className="mb-3 gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to notebook
          </Button>
          <div className="mb-1 px-3 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Admin settings
          </div>
          <nav className="flex flex-col gap-0.5">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href ||
                (item.href !== "/settings/admin" && pathname?.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm",
                    active
                      ? "bg-primary/10 text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </main>
  );
}
