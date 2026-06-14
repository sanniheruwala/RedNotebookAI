"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, KeyRound, Loader2, Save, TestTube2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

// Suggested models shown in the dropdown next to each provider's model
// field. The field is editable so admins can still type a model name
// the SDK supports but we don't list. Keep these lists short and
// curated — exhaustive enumerations rot fast as providers ship new
// models.
const OPENAI_MODELS = [
  { value: "gpt-4o", label: "gpt-4o — flagship, multimodal" },
  { value: "gpt-4o-mini", label: "gpt-4o-mini — fast, cheap" },
  { value: "gpt-4-turbo", label: "gpt-4-turbo" },
  { value: "o1-preview", label: "o1-preview — reasoning" },
  { value: "o1-mini", label: "o1-mini — reasoning, faster" },
  { value: "gpt-3.5-turbo", label: "gpt-3.5-turbo — legacy" },
];

const ANTHROPIC_MODELS = [
  { value: "claude-opus-4-7", label: "claude-opus-4-7 — most capable" },
  { value: "claude-sonnet-4-6", label: "claude-sonnet-4-6 — best coding" },
  {
    value: "claude-haiku-4-5-20251001",
    label: "claude-haiku-4-5-20251001 — fast, cheap",
  },
  { value: "claude-3-7-sonnet-latest", label: "claude-3-7-sonnet-latest" },
  { value: "claude-3-5-sonnet-latest", label: "claude-3-5-sonnet-latest" },
  { value: "claude-3-5-haiku-latest", label: "claude-3-5-haiku-latest" },
];

export default function AdminAIPage() {
  const qc = useQueryClient();
  const config = useQuery({
    queryKey: ["admin-ai-config"],
    queryFn: api.adminGetAIConfig,
  });
  const health = useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    // Refresh after save so the "active provider" badge reflects reality.
    staleTime: 0,
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
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin-ai-config"] });
      qc.invalidateQueries({ queryKey: ["health"] });
      if (res?.auto_switched_provider) {
        toast.success(
          `Saved — active provider set to '${res.auto_switched_provider}'`
        );
      } else {
        toast.success("AI configuration saved");
      }
      setDraft({});
    },
    onError: (err: Error) =>
      toast.error(err instanceof HttpError ? err.message : err.message),
  });

  const clearSecret = (
    field: "openai_api_key" | "anthropic_api_key"
  ) => set(field, null);

  const test = useMutation({
    mutationFn: api.adminTestAIConfig,
    onSuccess: (res) => {
      if (res.ok) {
        toast.success(
          `Provider OK — ${res.provider}${res.model ? ` / ${res.model}` : ""}`,
          { description: res.sample ?? undefined, duration: 8000 }
        );
      } else {
        toast.error(`Provider check failed`, {
          description: res.error ?? "Unknown error",
          duration: 12000,
        });
      }
    },
    onError: (err: Error) => toast.error(err.message),
  });

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

      <ActiveProviderBanner
        configured={view.ai_provider ?? "(.env default)"}
        active={health.data?.ai_provider_active ?? "…"}
      />

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
            {sortProviders(current?.available_providers ?? []).map((p) => (
              <option key={p} value={p}>
                {providerLabel(p)}
              </option>
            ))}
          </Select>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            <strong>Bundled</strong> runs Qwen 1.5B locally on this machine —
            free, private, ~3-5s per query, fine for the demo notebook.
            <strong> OpenAI / Anthropic</strong> are faster and smarter but
            need an API key. <strong>Ollama</strong> lets you point at a
            bigger local model you already host. <strong>Mock</strong>
            returns deterministic stubs (useful for tests).
          </p>
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
            <ModelPicker
              listId="openai-models"
              options={OPENAI_MODELS}
              placeholder="gpt-4o-mini"
              value={view.openai_model ?? ""}
              onChange={(v) => set("openai_model", v || null)}
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
            <ModelPicker
              listId="anthropic-models"
              options={ANTHROPIC_MODELS}
              placeholder="claude-sonnet-4-6"
              value={view.anthropic_model ?? ""}
              onChange={(v) => set("anthropic_model", v || null)}
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

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => test.mutate()}
          disabled={test.isPending}
          className="gap-1.5"
        >
          {test.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TestTube2 className="h-4 w-4" />
          )}
          {test.isPending ? "Testing…" : "Test connection"}
        </Button>
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

function ModelPicker({
  listId,
  options,
  value,
  placeholder,
  onChange,
}: {
  listId: string;
  options: { value: string; label: string }[];
  value: string;
  placeholder: string;
  onChange: (next: string) => void;
}) {
  // Free-text Input + DropdownMenu of curated suggestions. We moved
  // off <datalist> because browsers filter suggestions to substrings
  // of the current value — once a model is saved, the dropdown shows
  // only that one match. The explicit DropdownMenu always lists every
  // curated model while the input still accepts custom IDs (fine-tunes,
  // aliases, models we haven't curated yet).
  return (
    <div className="flex gap-1.5">
      <Input
        id={listId}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1"
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            type="button"
            aria-label="Pick from curated models"
            className="shrink-0"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-72 w-72 overflow-y-auto">
          {options.map((o) => (
            <DropdownMenuItem
              key={o.value}
              onSelect={() => onChange(o.value)}
              className="flex items-start gap-2 text-xs"
            >
              <Check
                className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${
                  value === o.value ? "opacity-100" : "opacity-0"
                }`}
              />
              <span className="min-w-0 flex-1 whitespace-normal">{o.label}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ActiveProviderBanner({
  configured,
  active,
}: {
  configured: string;
  active: string;
}) {
  // The configured provider is what the admin picked (or null = .env
  // default). The active provider is what's actually wired after init.
  // They diverge when the configured one can't be loaded — e.g. missing
  // SDK / bad key — and we silently fall back to the mock. Surfacing
  // the gap here saves another round of "AI seems to be not working".
  const isMockActive = active === "mock";
  const isMockConfigured =
    configured === "mock" || configured === "(.env default)";
  const mismatchedToMock = isMockActive && !isMockConfigured;
  return (
    <div
      className={`flex items-start gap-3 rounded-xl border p-3 text-xs ${
        mismatchedToMock
          ? "border-destructive/40 bg-destructive/10 text-destructive"
          : isMockActive
            ? "border-border bg-muted/30 text-muted-foreground"
            : "border-primary/30 bg-primary/[0.05] text-primary"
      }`}
    >
      {mismatchedToMock ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <div className="min-w-0 space-y-0.5">
        <div className="font-semibold">
          Active AI provider: <span className="font-mono">{active}</span>
        </div>
        {mismatchedToMock ? (
          <div className="leading-relaxed">
            Configured as <span className="font-mono">{configured}</span>, but
            instantiation failed — check that the API key is valid. Falling
            back to the deterministic mock provider.
          </div>
        ) : (
          <div className="leading-relaxed">
            Configured as <span className="font-mono">{configured}</span>. All
            AI requests across notebooks, charts, knowledge, and Ask AI use
            this provider.
          </div>
        )}
      </div>
    </div>
  );
}

// Human-readable labels for the provider dropdown. Returns the raw key
// untouched if we don't have a friendly label — so a future provider
// addition still renders something rather than disappearing.
function providerLabel(p: string): string {
  switch (p) {
    case "bundled":
      return "Bundled · Qwen 1.5B (local, no setup)";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "ollama":
      return "Ollama (point at a local model server)";
    case "mock":
      return "Mock (deterministic stubs)";
    default:
      return p;
  }
}

// Order the dropdown by "what should a first-time user pick" — bundled
// first because it works with no setup, then the paid hosted providers,
// then ollama (self-host), then mock at the bottom.
function sortProviders(providers: readonly string[]): string[] {
  const order = ["bundled", "openai", "anthropic", "ollama", "mock"];
  return [...providers].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}
