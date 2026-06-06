"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { api, HttpError } from "@/lib/api";
import type { AIRuntimeConfig } from "@/lib/types";

const CONTEXT_MODES = [
  { value: "schema_only", label: "Schema only (safest)" },
  { value: "schema_and_stats", label: "Schema + aggregated stats" },
  { value: "schema_stats_samples", label: "Schema + stats + sample rows" },
];

export default function AdminAIPage() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ["admin-ai-config"],
    queryFn: api.adminGetAIConfig,
  });

  const [draft, setDraft] = React.useState<Partial<AIRuntimeConfig>>({});

  // Hydrate the draft once data arrives.
  React.useEffect(() => {
    if (config.data) setDraft({});
  }, [config.data]);

  const set = <K extends keyof AIRuntimeConfig>(
    k: K,
    v: AIRuntimeConfig[K] | null
  ) => setDraft((d) => ({ ...d, [k]: v }));

  const current = config.data;
  const view = { ...(current ?? {}), ...draft } as AIRuntimeConfig;

  const save = useMutation({
    mutationFn: () => {
      // Only PUT fields the admin actually touched
      const body = Object.fromEntries(
        Object.entries(draft).filter(([k]) => k !== "available_providers")
      );
      return api.adminUpdateAIConfig(body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-ai-config"] });
      qc.invalidateQueries({ queryKey: ["health"] });
      toast.success("AI configuration saved");
      setDraft({});
    },
    onError: (err: Error) =>
      toast.error(err instanceof HttpError ? err.message : err.message),
  });

  const clearSecret = (
    field: "openai_api_key" | "anthropic_api_key"
  ) => set(field, null);

  if (config.isPending) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/20">
          <KeyRound className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-balance text-xl font-semibold tracking-tightish">
            AI provider
          </h1>
          <p className="text-sm text-muted-foreground">
            These overrides take precedence over the matching <code>.env</code>{" "}
            entries. Stored encrypted on disk with the server&apos;s{" "}
            <code>SECRET_KEY</code>.
          </p>
        </div>
      </header>

      <section className="card-premium space-y-3 p-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Provider
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="provider" className="text-xs">
            Active provider
          </Label>
          <Select
            id="provider"
            value={view.ai_provider ?? ""}
            onChange={(e) => set("ai_provider", e.target.value || null)}
          >
            <option value="">Use .env default</option>
            {(current?.available_providers ?? []).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </div>
      </section>

      <section className="card-premium space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            OpenAI
          </div>
          {current?.openai_api_key && (
            <Badge variant="outline" className="text-[10px]">
              Key stored
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="API key" className="col-span-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={
                  current?.openai_api_key ? "Keep existing key" : "sk-…"
                }
                value={
                  draft.openai_api_key ??
                  (current?.openai_api_key ?? "")
                }
                onChange={(e) =>
                  set("openai_api_key", e.target.value || null)
                }
              />
              {current?.openai_api_key && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => clearSecret("openai_api_key")}
                  aria-label="Clear OpenAI key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </Field>
          <Field label="Model" className="col-span-2">
            <Input
              placeholder="gpt-4o-mini"
              value={view.openai_model ?? ""}
              onChange={(e) => set("openai_model", e.target.value || null)}
            />
          </Field>
        </div>
      </section>

      <section className="card-premium space-y-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Anthropic
          </div>
          {current?.anthropic_api_key && (
            <Badge variant="outline" className="text-[10px]">
              Key stored
            </Badge>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="API key" className="col-span-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={
                  current?.anthropic_api_key ? "Keep existing key" : "sk-ant-…"
                }
                value={
                  draft.anthropic_api_key ??
                  (current?.anthropic_api_key ?? "")
                }
                onChange={(e) =>
                  set("anthropic_api_key", e.target.value || null)
                }
              />
              {current?.anthropic_api_key && (
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => clearSecret("anthropic_api_key")}
                  aria-label="Clear Anthropic key"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </Field>
          <Field label="Model" className="col-span-2">
            <Input
              placeholder="claude-sonnet-4-6"
              value={view.anthropic_model ?? ""}
              onChange={(e) => set("anthropic_model", e.target.value || null)}
            />
          </Field>
        </div>
      </section>

      <section className="card-premium space-y-3 p-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Ollama (local)
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Base URL">
            <Input
              placeholder="http://localhost:11434"
              value={view.ollama_base_url ?? ""}
              onChange={(e) => set("ollama_base_url", e.target.value || null)}
            />
          </Field>
          <Field label="Model">
            <Input
              placeholder="llama3"
              value={view.ollama_model ?? ""}
              onChange={(e) => set("ollama_model", e.target.value || null)}
            />
          </Field>
        </div>
      </section>

      <section className="card-premium space-y-3 p-5">
        <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Privacy
        </div>
        <Field label="Context mode">
          <Select
            value={view.ai_context_mode ?? ""}
            onChange={(e) => set("ai_context_mode", e.target.value || null)}
          >
            <option value="">Use .env default</option>
            {CONTEXT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="allow-samples"
              checked={view.ai_allow_sample_rows ?? false}
              onCheckedChange={(v) => set("ai_allow_sample_rows", v)}
            />
            <Label htmlFor="allow-samples" className="text-xs">
              Allow sample rows in AI context
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="mask-pii"
              checked={view.ai_mask_pii ?? true}
              onCheckedChange={(v) => set("ai_mask_pii", v)}
            />
            <Label htmlFor="mask-pii" className="text-xs">
              Mask PII columns
            </Label>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          onClick={() => save.mutate()}
          disabled={save.isPending || Object.keys(draft).length === 0}
          className="gap-1.5 shadow-sm shadow-primary/20"
        >
          {save.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Save changes
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
