"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import * as React from "react";
import { api } from "@/lib/api";

export function useAuthStatus() {
  return useQuery({
    queryKey: ["auth-status"],
    queryFn: api.authStatus,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

/**
 * Guard a page on the authenticated experience.
 *
 * Behavior:
 *  - When auth is disabled, returns the synthetic "default" status; never redirects.
 *  - When auth is enabled and the user is NOT authenticated, redirects to /login.
 *  - When auth is enabled, no users exist yet (bootstrap), and the user is NOT
 *    authenticated, redirects to /register (first signup becomes admin).
 */
export function useRequireAuth() {
  const router = useRouter();
  const status = useAuthStatus();

  React.useEffect(() => {
    if (!status.data) return;
    if (!status.data.auth_enabled) return;
    if (status.data.authenticated) return;
    if (status.data.is_bootstrap) {
      router.replace("/register");
    } else {
      router.replace("/login");
    }
  }, [status.data, router]);

  return status;
}

export function useLogout() {
  const router = useRouter();
  const qc = useQueryClient();
  return async () => {
    try {
      await api.logout();
    } catch {
      /* ignore */
    }
    qc.clear();
    router.replace("/login");
  };
}
