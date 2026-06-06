"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useAuthStatus, useLogout } from "@/hooks/use-auth";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function UserMenu() {
  const status = useAuthStatus();
  const logout = useLogout();
  const router = useRouter();

  if (!status.data?.auth_enabled) return null;
  const user = status.data.user;
  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-2 rounded-full pl-1 pr-2"
          aria-label="Account menu"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-gradient-to-br from-primary/30 to-primary/5 text-[10px] font-semibold text-primary ring-1 ring-primary/30">
            {initials(user.name)}
          </span>
          <span className="max-w-[14ch] truncate text-xs font-medium">
            {user.name}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium text-foreground">
              {user.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {user.email}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="gap-2 text-xs"
          onSelect={() => router.push("/settings/tokens")}
        >
          <KeyRound className="h-3.5 w-3.5" /> API tokens
        </DropdownMenuItem>
        {user.is_admin && (
          <DropdownMenuItem
            className="gap-2 text-xs"
            onSelect={() => router.push("/settings/admin")}
          >
            <ShieldCheck className="h-3.5 w-3.5 text-primary" /> Admin settings
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            void logout();
          }}
          className="gap-2 text-xs text-destructive focus:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
