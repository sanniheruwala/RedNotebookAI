"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { BrandMark } from "@/components/brand-mark";
import { api, HttpError } from "@/lib/api";
import { useAuthStatus } from "@/hooks/use-auth";

export default function RegisterPage() {
  return (
    <React.Suspense
      fallback={
        <main className="app-mesh grid min-h-screen place-items-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </main>
      }
    >
      <RegisterForm />
    </React.Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const status = useAuthStatus();

  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const inviteToken = params.get("token") || undefined;

  React.useEffect(() => {
    if (!status.data) return;
    if (!status.data.auth_enabled || status.data.authenticated) {
      router.replace("/");
    }
    if (
      status.data.auth_enabled &&
      !status.data.is_bootstrap &&
      !inviteToken &&
      !status.data.allow_self_signup
    ) {
      // Closed signup, no invite. Bounce back to login.
      router.replace("/login");
    }
  }, [status.data, router, inviteToken]);

  const register = useMutation({
    mutationFn: () =>
      api.register({
        email,
        name,
        password,
        invite_token: inviteToken ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["auth-status"] });
      router.replace("/");
    },
    onError: (err: Error) => {
      setError(err instanceof HttpError ? err.message : "Registration failed");
    },
  });

  const isBootstrap = status.data?.is_bootstrap ?? false;

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
              {isBootstrap ? "Create the admin account" : "Create your account"}
            </h1>
            <p className="text-sm text-muted-foreground">
              {isBootstrap
                ? "First user becomes the workspace admin."
                : "Set up your RedNotebook AI account."}
            </p>
            {isBootstrap && (
              <Badge
                variant="outline"
                className="mt-2 border-primary/30 bg-primary/10 text-[10px] font-semibold uppercase tracking-widest text-primary"
              >
                First-time setup
              </Badge>
            )}
            {!isBootstrap && inviteToken && (
              <Badge
                variant="outline"
                className="mt-2 text-[10px] font-semibold uppercase tracking-widest"
              >
                Invite accepted
              </Badge>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            register.mutate();
          }}
          className="mt-6 space-y-3"
        >
          <div className="space-y-1.5">
            <Label htmlFor="name">Display name</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alex Doe"
              autoFocus
            />
          </div>
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
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
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
            disabled={register.isPending}
          >
            {register.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {isBootstrap ? "Create admin account" : "Create account"}
          </Button>
        </form>

        <div className="mt-5 text-center text-xs text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-foreground hover:text-primary"
          >
            Sign in
          </Link>
        </div>
      </motion.div>
    </main>
  );
}
