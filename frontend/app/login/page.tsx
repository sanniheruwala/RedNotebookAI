"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Github, Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand-mark";
import { api, HttpError } from "@/lib/api";
import { useAuthStatus } from "@/hooks/use-auth";

export default function LoginPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const status = useAuthStatus();
  const providers = useQuery({
    queryKey: ["oauth-providers"],
    queryFn: api.oauthProviders,
    enabled: status.data?.auth_enabled ?? false,
    staleTime: 5 * 60_000,
  });
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // Redirect away from /login if auth is disabled or already authed.
  React.useEffect(() => {
    if (!status.data) return;
    if (!status.data.auth_enabled || status.data.authenticated) {
      router.replace("/");
    } else if (status.data.is_bootstrap) {
      router.replace("/register");
    }
  }, [status.data, router]);

  const login = useMutation({
    mutationFn: () => api.login({ email, password }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth-status"] });
      router.replace("/");
    },
    onError: (err: Error) => {
      setError(err instanceof HttpError ? err.message : "Login failed");
    },
  });

  return (
    <main className="app-mesh flex min-h-screen items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="card-premium w-full max-w-md p-8"
      >
        <div className="flex flex-col items-center gap-3">
          <BrandMark size={40} />
          <div className="text-center">
            <h1 className="text-balance text-xl font-semibold tracking-tightish">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to RedNotebook AI
            </p>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            login.mutate();
          }}
          className="mt-6 space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Your password"
            />
          </div>
          {error && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}
          <Button
            type="submit"
            className="w-full gap-1.5 shadow-sm shadow-primary/20"
            disabled={login.isPending}
          >
            {login.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Sign in
          </Button>
        </form>

        {(providers.data?.providers ?? []).length > 0 && (
          <>
            <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-2">
              {(providers.data?.providers ?? []).includes("github") && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    window.location.href = "/api/auth/oauth/github/start";
                  }}
                >
                  <Github className="h-4 w-4" /> Continue with GitHub
                </Button>
              )}
            </div>
          </>
        )}

        {status.data?.allow_self_signup && (
          <div className="mt-5 text-center text-xs text-muted-foreground">
            New here?{" "}
            <Link
              href="/register"
              className="font-medium text-foreground hover:text-primary"
            >
              Create an account
            </Link>
          </div>
        )}
      </motion.div>
    </main>
  );
}
