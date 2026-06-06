"use client";

import * as React from "react";
import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { toast, Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HttpError } from "@/lib/api";

/**
 * Central error surface for TanStack Query — surfaces 429s as a
 * friendly "slow down" toast and lets per-handler `onError` keep
 * doing finer-grained things on top. Generic non-429 errors are
 * left to the call sites that already handle them.
 */
function handleQueryError(err: unknown) {
  if (err instanceof HttpError && err.status === 429) {
    toast.warning("Too many requests", {
      description: err.message || "Please slow down for a moment.",
      duration: 5000,
    });
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, err) => {
              // Never retry on 429 (we'd just make the limiter angrier).
              if (err instanceof HttpError && err.status === 429) return false;
              return failureCount < 1;
            },
          },
        },
        queryCache: new QueryCache({ onError: handleQueryError }),
        mutationCache: new MutationCache({ onError: handleQueryError }),
      })
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={client}>
        <TooltipProvider delayDuration={150}>
          {children}
          <Toaster position="bottom-right" richColors closeButton />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
