"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import type { EChartsType } from "echarts";
import {
  Check,
  Copy,
  Download,
  FileCode2,
  FileImage,
  FileSpreadsheet,
  RotateCcw,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  copyChartPngToClipboard,
  downloadChartPng,
  downloadChartSvg,
  downloadResultCsv,
} from "@/lib/chart-export";
import type { ChartConfig, QueryResultPayload } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// Palette presets — five distinct moods, each tuned for both dark and
// light backgrounds. The first entry is the anchor / "primary" used
// for single-series visuals; the rest fan out for multi-series charts.
// Picked to stay legible at low chart sizes and remain WCAG-comfortable
// on the card background.
export type PaletteKey = "brand" | "ocean" | "forest" | "sunset" | "mono";

const PALETTES: Record<PaletteKey, { dark: string[]; light: string[] }> = {
  brand: {
    dark: ["#f43f5e", "#22d3ee", "#a78bfa", "#34d399", "#fbbf24", "#60a5fa", "#f472b6", "#fb923c"],
    light: ["#e11d48", "#0891b2", "#7c3aed", "#059669", "#d97706", "#2563eb", "#db2777", "#ea580c"],
  },
  ocean: {
    dark: ["#22d3ee", "#60a5fa", "#a78bfa", "#34d399", "#f43f5e", "#fbbf24", "#f472b6", "#fb923c"],
    light: ["#0891b2", "#2563eb", "#7c3aed", "#059669", "#e11d48", "#d97706", "#db2777", "#ea580c"],
  },
  forest: {
    dark: ["#34d399", "#22d3ee", "#a78bfa", "#fbbf24", "#60a5fa", "#f43f5e", "#f472b6", "#fb923c"],
    light: ["#059669", "#0891b2", "#7c3aed", "#d97706", "#2563eb", "#e11d48", "#db2777", "#ea580c"],
  },
  sunset: {
    dark: ["#fb923c", "#f43f5e", "#fbbf24", "#a78bfa", "#22d3ee", "#34d399", "#60a5fa", "#f472b6"],
    light: ["#ea580c", "#e11d48", "#d97706", "#7c3aed", "#0891b2", "#059669", "#2563eb", "#db2777"],
  },
  mono: {
    dark: ["#cbd5e1", "#94a3b8", "#e2e8f0", "#64748b", "#f1f5f9", "#475569", "#f8fafc", "#334155"],
    light: ["#334155", "#64748b", "#475569", "#94a3b8", "#1e293b", "#cbd5e1", "#0f172a", "#e2e8f0"],
  },
};

type PaletteTheme = {
  palette: string[];
  primary: string;
  axisLine: string;
  splitLine: string;
  text: string;
  mutedText: string;
  tooltipBg: string;
  tooltipBorder: string;
  surface: string;
};

function buildTheme(isDark: boolean, paletteKey: PaletteKey = "brand"): PaletteTheme {
  const swatches = PALETTES[paletteKey] ?? PALETTES.brand;
  const palette = isDark ? swatches.dark : swatches.light;
  const primary = palette[0];
  if (isDark) {
    return {
      palette,
      primary,
      axisLine: "rgba(148, 163, 184, 0.25)",
      splitLine: "rgba(148, 163, 184, 0.10)",
      text: "rgba(226, 232, 240, 0.92)",
      mutedText: "rgba(148, 163, 184, 0.85)",
      tooltipBg: "rgba(15, 23, 42, 0.94)",
      tooltipBorder: `${primary}59`,
      surface: "transparent",
    };
  }
  return {
    palette,
    primary,
    axisLine: "rgba(15, 23, 42, 0.18)",
    splitLine: "rgba(15, 23, 42, 0.06)",
    text: "rgba(15, 23, 42, 0.92)",
    mutedText: "rgba(71, 85, 105, 0.85)",
    tooltipBg: "rgba(255, 255, 255, 0.98)",
    tooltipBorder: `${primary}40`,
    surface: "transparent",
  };
}

/* ----------------------- chart customization ----------------------- */

export type HeightKey = "compact" | "standard" | "tall";
export type YFormatKey = "auto" | "number" | "currency" | "percent";

export type ChartOptionsExt = {
  palette?: PaletteKey;
  height?: HeightKey;
  yFormat?: YFormatKey;
  yDecimals?: number;
  showLegend?: boolean;
  showGridlines?: boolean;
  showDataLabels?: boolean;
  smoothLines?: boolean;
  fillArea?: boolean;
};

const HEIGHT_PX: Record<HeightKey, number> = {
  compact: 280,
  standard: 380,
  tall: 540,
};

const DEFAULT_OPTIONS: Required<
  Pick<
    ChartOptionsExt,
    | "palette"
    | "height"
    | "yFormat"
    | "showLegend"
    | "showGridlines"
    | "showDataLabels"
    | "smoothLines"
    | "fillArea"
  >
> = {
  palette: "brand",
  height: "standard",
  yFormat: "auto",
  showLegend: false,
  showGridlines: true,
  showDataLabels: false,
  smoothLines: true,
  fillArea: false,
};

function readOptions(config: ChartConfig): ChartOptionsExt {
  return (config.options ?? {}) as ChartOptionsExt;
}

function formatTick(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    const abs = Math.abs(value);
    if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(1)}B`;
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2);
  }
  const s = String(value);
  return s.length > 18 ? `${s.slice(0, 16)}…` : s;
}

function formatFull(value: unknown): string {
  if (typeof value === "number") {
    return value.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  return value === null || value === undefined ? "" : String(value);
}

function aggregate(
  rows: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  aggregation: string | null | undefined,
): { x: string; y: number }[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const x = String(row[xKey] ?? "");
    const yRaw = row[yKey];
    const y = typeof yRaw === "number" ? yRaw : Number(yRaw);
    if (!Number.isFinite(y)) continue;
    const bucket = groups.get(x) ?? [];
    bucket.push(y);
    groups.set(x, bucket);
  }
  const agg = (vals: number[]) => {
    switch (aggregation) {
      case "avg":
      case "mean":
        return vals.reduce((a, b) => a + b, 0) / vals.length;
      case "min":
        return Math.min(...vals);
      case "max":
        return Math.max(...vals);
      case "count":
        return vals.length;
      case "sum":
      default:
        return vals.reduce((a, b) => a + b, 0);
    }
  };
  return [...groups.entries()].map(([x, vals]) => ({ x, y: agg(vals) }));
}

function isDateLike(s: string): boolean {
  if (s.length < 8) return false;
  return !Number.isNaN(Date.parse(s));
}

export function ChartView({
  result,
  config,
  onChange,
  compact = false,
}: {
  result: QueryResultPayload;
  config: ChartConfig;
  /** Provide a setter to let the user open the Customize popover and
   *  edit title / palette / format / toggles in place. When omitted,
   *  the chart renders read-only — used by published HTML, the
   *  thumbnail grid, and other consumers that shouldn't mutate the
   *  cell. */
  onChange?: (next: ChartConfig) => void;
  /** Render as a smaller thumbnail (no card chrome, no title, fills
   *  the parent container). Used by the auto-recommended chart grid so
   *  4 charts can sit on screen. Implies read-only — even if onChange
   *  is provided, the Share + Customize affordances are not rendered. */
  compact?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const opts = readOptions(config);
  const paletteKey: PaletteKey = opts.palette ?? DEFAULT_OPTIONS.palette;
  const heightKey: HeightKey = opts.height ?? DEFAULT_OPTIONS.height;
  const heightPx = HEIGHT_PX[heightKey];
  const theme = React.useMemo(
    () => buildTheme(isDark, paletteKey),
    [isDark, paletteKey],
  );
  const echartsInstanceRef = React.useRef<EChartsType | null>(null);

  // Memo on the fields that actually affect the chart's ECharts option.
  // Title/subtitle are HTML-only (the report-card chrome renders them
  // outside the canvas), so including them in the dep array would force
  // a full ECharts redraw on every keystroke while the user is renaming
  // the chart — felt laggy and triggered the load animation. By keying
  // on the structural fields only, the canvas stays stable while the
  // HTML header re-renders for free.
  const optionsKey = config.options;
  const filtersKey = config.filters;
  const yKey = Array.isArray(config.y) ? config.y.join(",") : config.y;
  const option = React.useMemo(
    () => buildOption(result, config, theme),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      result,
      config.chart_type,
      config.x,
      yKey,
      config.color,
      config.aggregation,
      optionsKey,
      filtersKey,
      theme,
    ],
  );

  if (!option) {
    if (compact) {
      return (
        <div className="grid h-full place-items-center text-[11px] text-muted-foreground">
          (no preview)
        </div>
      );
    }
    return (
      <div className="rounded-xl border bg-gradient-to-br from-muted/20 to-muted/5 p-10 text-center text-sm text-muted-foreground">
        <div className="mx-auto mb-2 grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 3v18h18" />
            <path d="M7 14l4-4 4 4 6-6" />
          </svg>
        </div>
        Configure x and y axes to render a chart.
      </div>
    );
  }

  // SVG renderer for vector-crisp output at any DPR + screenshot fidelity.
  // For very large series (> ~3k points) ECharts performs better with
  // canvas; the threshold here is conservative enough that almost every
  // analyst-shaped result lands on SVG. Canvas fallback always honours
  // the device pixel ratio so it doesn't look fuzzy on Retina.
  const pointCount = pointEstimate(option);
  const useSvg = pointCount <= 3000;
  const dpr =
    typeof window !== "undefined" ? Math.max(2, window.devicePixelRatio || 2) : 2;

  if (compact) {
    return (
      <ReactECharts
        option={option}
        style={{ height: "100%", width: "100%" }}
        notMerge
        lazyUpdate
        opts={useSvg ? { renderer: "svg" } : { renderer: "canvas", devicePixelRatio: dpr }}
        theme={isDark ? "dark" : undefined}
      />
    );
  }

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-card ring-1 ring-inset ${
        isDark
          ? "border-border/60 ring-white/5 shadow-[0_22px_56px_-26px_rgba(0,0,0,0.6)]"
          : "border-border ring-black/[0.03] shadow-[0_22px_52px_-24px_rgba(15,23,42,0.18)]"
      }`}
    >
      {/* Thin brand-aligned accent strip at the very top — the
          report-card detail that signals "made with care". */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-primary/55 to-transparent"
      />
      <ChartHeader result={result} config={config} onChange={onChange}>
        {onChange && (
          <ChartCustomize config={config} onChange={onChange} />
        )}
        <ChartDownloadMenu
          getInstance={() => echartsInstanceRef.current}
          result={result}
          config={config}
        />
      </ChartHeader>
      <ReactECharts
        option={option}
        style={{ height: heightPx, width: "100%" }}
        notMerge
        lazyUpdate
        opts={useSvg ? { renderer: "svg" } : { renderer: "canvas", devicePixelRatio: dpr }}
        theme={isDark ? "dark" : undefined}
        onChartReady={(instance) => {
          echartsInstanceRef.current = instance as EChartsType;
        }}
      />
      <ChartFooter result={result} config={config} />
    </div>
  );
}

/**
 * Header strip rendered above the chart canvas. Title + auto-generated
 * description on the left, metadata badges + actions on the right.
 *
 * We render the title in HTML rather than as an ECharts title because
 * the analyst is consuming this as a report block — typography needs
 * proper font features (tabular nums, kerning), and the title should
 * never collide with the chart contents on small grids.
 */
function ChartHeader({
  result,
  config,
  onChange,
  children,
}: {
  result: QueryResultPayload;
  config: ChartConfig;
  onChange?: (next: ChartConfig) => void;
  children?: React.ReactNode;
}) {
  const titleResolved = (config.title && config.title.trim()) || autoTitle(config);
  const subtitleResolved =
    (config.subtitle && config.subtitle.trim()) || autoSubtitle(config);
  const editable = !!onChange;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 bg-gradient-to-b from-background/40 to-transparent px-5 pt-4 pb-3">
      <div className="min-w-0 flex-1">
        <EditableText
          value={config.title ?? ""}
          display={titleResolved}
          placeholder="Click to add a title"
          editable={editable}
          ariaLabel="Chart title"
          variant="title"
          onCommit={(next) =>
            onChange?.({ ...config, title: next.length ? next : null })
          }
        />
        {(subtitleResolved || editable) && (
          <EditableText
            value={config.subtitle ?? ""}
            display={subtitleResolved ?? ""}
            placeholder="Add a description"
            editable={editable}
            ariaLabel="Chart subtitle"
            variant="subtitle"
            onCommit={(next) =>
              onChange?.({ ...config, subtitle: next.length ? next : null })
            }
          />
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <MetaBadge>
          <span className="tabular-nums">
            {result.row_count.toLocaleString()}
          </span>
          <span className="ml-1 text-muted-foreground/80">rows</span>
        </MetaBadge>
        {children}
      </div>
    </div>
  );
}

/**
 * Click-to-edit text — looks like display copy until the user clicks
 * (or tabs to) it, then becomes an inline input. Enter / blur commits;
 * Escape reverts to the value at the start of the edit session.
 *
 * The single biggest UX win in the chart card: most users want to
 * rename the chart, and the Customize popover is overkill for that.
 * One click on the title → type → tab away. That's it.
 */
function EditableText({
  value,
  display,
  placeholder,
  editable,
  ariaLabel,
  variant,
  onCommit,
}: {
  /** The persisted value (may be empty when relying on `display`). */
  value: string;
  /** The text to show in read mode (auto-derived title/subtitle goes here). */
  display: string;
  placeholder: string;
  editable: boolean;
  ariaLabel: string;
  variant: "title" | "subtitle";
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  // Keep draft in sync if the value changes externally (e.g., another
  // tab edits via the Customize popover while this one is in read mode).
  React.useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const classes =
    variant === "title"
      ? "text-[15px] font-semibold leading-snug tracking-tight text-foreground"
      : "text-[11.5px] leading-snug text-muted-foreground";

  if (!editing) {
    const shown = display || placeholder;
    const isPlaceholder = !display;
    return (
      <button
        type="button"
        disabled={!editable}
        onClick={() => {
          if (editable) {
            setDraft(value);
            setEditing(true);
          }
        }}
        title={editable ? "Click to edit" : undefined}
        aria-label={ariaLabel}
        className={`block w-full truncate rounded-sm text-left ${classes} ${
          editable
            ? "cursor-text hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40"
            : "cursor-default"
        } ${
          isPlaceholder
            ? "text-muted-foreground/60 italic"
            : ""
        } ${variant === "subtitle" ? "mt-0.5" : ""}`}
      >
        {shown}
      </button>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    setEditing(false);
    if (trimmed !== value.trim()) {
      onCommit(trimmed);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  return (
    <input
      ref={(el) => {
        inputRef.current = el;
        if (el) {
          el.focus();
          el.select();
        }
      }}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          inputRef.current?.blur();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
      placeholder={placeholder}
      aria-label={ariaLabel}
      className={`block w-full rounded-sm border border-primary/40 bg-background px-1 py-0 outline-none ring-1 ring-primary/30 ${classes} ${
        variant === "subtitle" ? "mt-0.5" : ""
      }`}
    />
  );
}

function ChartFooter({
  result,
  config,
}: {
  result: QueryResultPayload;
  config: ChartConfig;
}) {
  const aggLabel = humanizeAggregation(config.aggregation);
  const showAgg =
    aggLabel !== null &&
    config.chart_type !== "scatter" &&
    config.chart_type !== "kpi";
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/60 bg-muted/[0.04] px-5 py-2 text-[10.5px] leading-snug text-muted-foreground">
      <div className="flex items-center gap-2">
        {showAgg && (
          <span className="inline-flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-primary/70" />
            Aggregated by{" "}
            <span className="font-medium text-foreground/80">{aggLabel}</span>
          </span>
        )}
        {result.truncated && (
          <span className="rounded-md bg-amber-500/10 px-1.5 py-px text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-300">
            Result truncated · download CSV for full data
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {result.duration_seconds > 0 && (
          <span className="tabular-nums">
            {result.duration_seconds < 1
              ? `${Math.round(result.duration_seconds * 1000)}ms`
              : `${result.duration_seconds.toFixed(2)}s`}{" "}
            query
          </span>
        )}
        <span className="tracking-wide">
          Made with{" "}
          <span className="font-medium text-foreground/70">RedNotebook</span>
        </span>
      </div>
    </div>
  );
}

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/70 bg-background/50 px-1.5 py-0.5 text-[10.5px] font-medium text-foreground/80 shadow-sm">
      {children}
    </span>
  );
}

function autoTitle(config: ChartConfig): string {
  const y = Array.isArray(config.y) ? config.y[0] : config.y;
  const x = config.x;
  const kind = config.chart_type;
  if (kind === "kpi") return prettify(y ?? "Metric");
  if (kind === "scatter" && y && x) {
    return `${prettify(y)} vs ${prettify(x)}`;
  }
  if (kind === "pie" || kind === "donut") {
    return y && x ? `Share of ${prettify(y)} by ${prettify(x)}` : "Composition";
  }
  if (kind === "histogram") {
    return y ? `Distribution of ${prettify(y)}` : "Distribution";
  }
  if (kind === "time_series" || kind === "line" || kind === "area") {
    return y && x ? `${prettify(y)} over ${prettify(x)}` : "Trend";
  }
  if (kind === "bar" || kind === "stacked_bar") {
    return y && x ? `${prettify(y)} by ${prettify(x)}` : "Comparison";
  }
  return prettify(kind);
}

function autoSubtitle(config: ChartConfig): string | null {
  const agg = humanizeAggregation(config.aggregation);
  const y = Array.isArray(config.y) ? config.y[0] : config.y;
  const x = config.x;
  if (config.chart_type === "kpi") {
    return agg ? `${agg} · single value` : "Single value";
  }
  if (config.chart_type === "scatter") {
    return "Each dot is one row";
  }
  if (config.chart_type === "histogram") {
    return "Frequency distribution";
  }
  const parts: string[] = [];
  if (agg && y) parts.push(`${agg} of ${prettify(y)}`);
  else if (y) parts.push(prettify(y));
  if (x) parts.push(`grouped by ${prettify(x)}`);
  return parts.length ? parts.join(" · ") : null;
}

function humanizeAggregation(agg: string | null | undefined): string | null {
  if (!agg) return null;
  const map: Record<string, string> = {
    sum: "Sum",
    avg: "Average",
    mean: "Average",
    min: "Minimum",
    max: "Maximum",
    count: "Count",
  };
  return map[agg] ?? null;
}

function prettify(s: string): string {
  return s
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/* ------------------------- Y-axis formatters ----------------------- */

function makeYFormatter(format: YFormatKey): (v: unknown) => string {
  if (format === "auto") return formatTick;
  if (format === "percent") {
    return (v) => {
      if (typeof v !== "number" || !Number.isFinite(v)) return "";
      // Two display modes: values in [0, 1] are treated as ratios and
      // multiplied; values larger than that are already in percent units.
      const pct = Math.abs(v) <= 1 ? v * 100 : v;
      return `${pct.toFixed(1)}%`;
    };
  }
  if (format === "currency") {
    return (v) => {
      if (typeof v !== "number" || !Number.isFinite(v)) return "";
      const abs = Math.abs(v);
      const sign = v < 0 ? "-" : "";
      if (abs >= 1_000_000_000) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
      if (abs >= 1_000_000) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
      if (abs >= 1_000) return `${sign}$${(abs / 1e3).toFixed(1)}k`;
      return `${sign}$${abs.toLocaleString(undefined, {
        maximumFractionDigits: 2,
      })}`;
    };
  }
  // "number" — full locale-formatted integer/decimal
  return (v) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "";
    return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };
}

/**
 * Download menu overlaid in the top-right of the chart card.
 *
 * Lives next to the chart instead of in the toolbar above because the
 * "share this chart" intent is contextual to a specific chart, not the
 * whole result tab. The menu is visible at low opacity and lifts to
 * full opacity on hover so it doesn't compete with the chart itself
 * for attention but is one click away when needed.
 */
function ChartDownloadMenu({
  getInstance,
  result,
  config,
}: {
  getInstance: () => EChartsType | null;
  result: QueryResultPayload;
  config: ChartConfig;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "png" | "svg" | "copy" | "csv">(
    null,
  );
  const [copied, setCopied] = React.useState(false);

  const baseName = React.useMemo(() => deriveChartName(config), [config]);

  const runWithInstance = async (
    kind: "png" | "svg" | "copy",
    fn: (instance: EChartsType) => Promise<unknown>,
    successMessage: string,
  ) => {
    const instance = getInstance();
    if (!instance) {
      toast.error("Chart not ready yet — try again in a moment.");
      return;
    }
    setBusy(kind);
    try {
      await fn(instance);
      toast.success(successMessage);
      if (kind === "copy") {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }
    } catch (err) {
      console.error("chart export failed", err);
      toast.error("Couldn't export the chart. Check the browser console.");
    } finally {
      setBusy(null);
    }
  };

  const onDownloadPng = () =>
    runWithInstance(
      "png",
      (inst) => downloadChartPng(inst, baseName),
      `Downloaded ${baseName}.png`,
    );

  const onDownloadSvg = () =>
    runWithInstance(
      "svg",
      (inst) => downloadChartSvg(inst, baseName),
      `Downloaded ${baseName}.svg`,
    );

  const onCopyImage = () =>
    runWithInstance(
      "copy",
      async (inst) => {
        const ok = await copyChartPngToClipboard(inst);
        if (!ok) {
          throw new Error(
            "Clipboard write rejected (insecure context or no permission).",
          );
        }
      },
      "Image copied to clipboard",
    );

  const onDownloadCsv = () => {
    setBusy("csv");
    try {
      downloadResultCsv(result.rows, result.columns, baseName);
      toast.success(`Downloaded ${baseName}.csv`);
    } catch (err) {
      console.error("csv export failed", err);
      toast.error("Couldn't export CSV.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy !== null}
          className="h-8 gap-1.5 rounded-lg border-border/70 bg-background/40 px-2.5 text-[11.5px] font-medium backdrop-blur-md hover:bg-background"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-500" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          <span>Share</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-60"
          sideOffset={6}
        >
          <DropdownMenuLabel className="text-[11px] font-medium text-muted-foreground">
            Download or copy
          </DropdownMenuLabel>
          <DropdownMenuItem onSelect={onDownloadPng} disabled={busy !== null}>
            <FileImage className="mr-2 h-3.5 w-3.5" />
            <div className="flex flex-1 flex-col">
              <span>Download as PNG</span>
              <span className="text-[10.5px] text-muted-foreground">
                High-res raster · paste anywhere
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onDownloadSvg} disabled={busy !== null}>
            <FileCode2 className="mr-2 h-3.5 w-3.5" />
            <div className="flex flex-1 flex-col">
              <span>Download as SVG</span>
              <span className="text-[10.5px] text-muted-foreground">
                Vector · scales without blur
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCopyImage} disabled={busy !== null}>
            <Copy className="mr-2 h-3.5 w-3.5" />
            <div className="flex flex-1 flex-col">
              <span>Copy image to clipboard</span>
              <span className="text-[10.5px] text-muted-foreground">
                Paste into Slack, Docs, email
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDownloadCsv} disabled={busy !== null}>
            <FileSpreadsheet className="mr-2 h-3.5 w-3.5" />
            <div className="flex flex-1 flex-col">
              <span>Download data as CSV</span>
              <span className="text-[10.5px] text-muted-foreground">
                {result.row_count.toLocaleString()} rows · the numbers behind
                this chart
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
  );
}

/**
 * Customize popover — the "make this look how I want it" surface.
 *
 * Why a popover rather than an inline panel: the chart card is already
 * dense (header / chart / footer / share menu). A popover keeps the
 * customization knobs one click away without growing the resting-state
 * footprint. Changes apply live to the chart underneath so the user
 * sees the effect immediately.
 *
 * Everything edits config.options (Record<string, unknown> on the
 * server-side type) so persistence is a no-op — just save the cell.
 */
function ChartCustomize({
  config,
  onChange,
}: {
  config: ChartConfig;
  onChange: (next: ChartConfig) => void;
}) {
  const opts = readOptions(config);
  const paletteKey: PaletteKey = opts.palette ?? DEFAULT_OPTIONS.palette;
  const heightKey: HeightKey = opts.height ?? DEFAULT_OPTIONS.height;
  const yFormat: YFormatKey = opts.yFormat ?? DEFAULT_OPTIONS.yFormat;

  const patch = (
    field: keyof ChartConfig | "options",
    value: ChartConfig[keyof ChartConfig] | Partial<ChartOptionsExt>,
  ) => {
    if (field === "options") {
      onChange({
        ...config,
        options: { ...(config.options ?? {}), ...(value as object) },
      });
    } else {
      onChange({ ...config, [field]: value });
    }
  };

  const reset = () =>
    onChange({
      ...config,
      title: null,
      subtitle: null,
      options: {},
    });

  // Hide line/area-specific toggles for chart types where they don't apply.
  const isLineish =
    config.chart_type === "line" ||
    config.chart_type === "time_series" ||
    config.chart_type === "area";
  const isBarish =
    config.chart_type === "bar" ||
    config.chart_type === "stacked_bar" ||
    config.chart_type === "histogram";
  const hasAxes =
    config.chart_type !== "kpi" &&
    config.chart_type !== "pie" &&
    config.chart_type !== "donut";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 rounded-lg border-border/70 bg-background/40 px-2.5 text-[11.5px] font-medium backdrop-blur-md hover:bg-background"
        >
          <Sliders className="h-3.5 w-3.5" />
          <span>Customize</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-80 max-h-[70vh] overflow-y-auto p-0">
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
          <div className="text-[12.5px] font-semibold tracking-tight">
            Customize chart
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={reset}
            className="h-6 gap-1 px-2 text-[10.5px] text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>

        <CustomizeSection title="Title & description">
          <Label htmlFor="chart-title" className="text-[11px] text-muted-foreground">
            Title
          </Label>
          <Input
            id="chart-title"
            value={config.title ?? ""}
            placeholder="Auto"
            onChange={(e) => patch("title", e.target.value || null)}
            className="h-8 text-[12.5px]"
          />
          <Label htmlFor="chart-subtitle" className="mt-1 text-[11px] text-muted-foreground">
            Subtitle
          </Label>
          <Input
            id="chart-subtitle"
            value={config.subtitle ?? ""}
            placeholder="Auto"
            onChange={(e) => patch("subtitle", e.target.value || null)}
            className="h-8 text-[12.5px]"
          />
        </CustomizeSection>

        <CustomizeSection title="Look">
          <Label className="text-[11px] text-muted-foreground">Palette</Label>
          <div className="mt-1 grid grid-cols-5 gap-1.5">
            {(Object.keys(PALETTES) as PaletteKey[]).map((key) => (
              <PaletteSwatch
                key={key}
                paletteKey={key}
                selected={paletteKey === key}
                onSelect={() => patch("options", { palette: key })}
              />
            ))}
          </div>
          <Label className="mt-3 text-[11px] text-muted-foreground">Height</Label>
          <Segmented<HeightKey>
            value={heightKey}
            options={[
              { label: "Compact", value: "compact" },
              { label: "Standard", value: "standard" },
              { label: "Tall", value: "tall" },
            ]}
            onChange={(v) => patch("options", { height: v })}
          />
        </CustomizeSection>

        {hasAxes && (
          <CustomizeSection title="Numbers">
            <Label className="text-[11px] text-muted-foreground">
              Y-axis format
            </Label>
            <Segmented<YFormatKey>
              value={yFormat}
              options={[
                { label: "Auto", value: "auto" },
                { label: "Number", value: "number" },
                { label: "$", value: "currency" },
                { label: "%", value: "percent" },
              ]}
              onChange={(v) => patch("options", { yFormat: v })}
            />
          </CustomizeSection>
        )}

        <CustomizeSection title="Show">
          <ToggleRow
            label="Legend"
            description="Show series labels under the chart"
            checked={opts.showLegend ?? DEFAULT_OPTIONS.showLegend}
            onChange={(v) => patch("options", { showLegend: v })}
          />
          {hasAxes && (
            <ToggleRow
              label="Gridlines"
              description="Horizontal dashed reference lines"
              checked={opts.showGridlines ?? DEFAULT_OPTIONS.showGridlines}
              onChange={(v) => patch("options", { showGridlines: v })}
            />
          )}
          {isBarish && (
            <ToggleRow
              label="Data labels"
              description="Print the value on top of each bar"
              checked={
                opts.showDataLabels ?? false
              }
              onChange={(v) => patch("options", { showDataLabels: v })}
            />
          )}
          {isLineish && (
            <>
              <ToggleRow
                label="Smooth lines"
                description="Curved spline instead of jagged segments"
                checked={opts.smoothLines ?? DEFAULT_OPTIONS.smoothLines}
                onChange={(v) => patch("options", { smoothLines: v })}
              />
              <ToggleRow
                label="Fill area"
                description="Gradient fill below the line"
                checked={opts.fillArea ?? DEFAULT_OPTIONS.fillArea}
                onChange={(v) => patch("options", { fillArea: v })}
              />
            </>
          )}
        </CustomizeSection>
      </PopoverContent>
    </Popover>
  );
}

function CustomizeSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 border-b border-border/40 px-4 py-3 last:border-b-0">
      <div className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-muted-foreground/80">
        {title}
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="mt-1 inline-flex w-full rounded-md border border-border/70 bg-muted/30 p-0.5">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors ${
            value === o.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PaletteSwatch({
  paletteKey,
  selected,
  onSelect,
}: {
  paletteKey: PaletteKey;
  selected: boolean;
  onSelect: () => void;
}) {
  // Use the dark variant for the swatch — slightly more vivid, works
  // on both light and dark popover backgrounds.
  const colors = PALETTES[paletteKey].dark.slice(0, 4);
  return (
    <button
      type="button"
      onClick={onSelect}
      title={paletteKey}
      className={`flex h-7 items-center overflow-hidden rounded-md border transition-all ${
        selected
          ? "border-primary ring-2 ring-primary/30"
          : "border-border/70 hover:border-border"
      }`}
    >
      {colors.map((c, i) => (
        <span
          key={i}
          className="block h-full flex-1"
          style={{ backgroundColor: c }}
        />
      ))}
    </button>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium leading-snug">{label}</div>
        {description && (
          <div className="text-[10.5px] leading-snug text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function deriveChartName(config: ChartConfig): string {
  if (config.title && config.title.trim().length > 0) {
    return config.title.trim();
  }
  const x = config.x ?? "x";
  const y = Array.isArray(config.y) ? config.y[0] : config.y ?? "y";
  return `${config.chart_type}-${x}-by-${y}`;
}

/**
 * Best-effort guess at how many points the chart will draw — used to
 * decide between SVG (crisp) and canvas (faster for huge series).
 * Doesn't need to be exact; we err on the SVG side.
 */
function pointEstimate(option: Record<string, unknown> | null): number {
  if (!option) return 0;
  const series = (option as { series?: unknown[] }).series ?? [];
  let total = 0;
  for (const s of series) {
    const data = (s as { data?: unknown[] }).data;
    if (Array.isArray(data)) total += data.length;
  }
  return total;
}

function baseTooltip(theme: PaletteTheme) {
  return {
    trigger: "axis" as const,
    backgroundColor: theme.tooltipBg,
    borderColor: theme.tooltipBorder,
    borderWidth: 1,
    padding: [12, 14],
    textStyle: {
      color: theme.text,
      fontFamily: "var(--font-sans), -apple-system, sans-serif",
      fontSize: 13,
      lineHeight: 18,
    },
    extraCssText:
      "backdrop-filter: blur(18px) saturate(180%); -webkit-backdrop-filter: blur(18px) saturate(180%); border-radius: 12px; box-shadow: 0 18px 48px rgba(15, 23, 42, 0.28);",
    axisPointer: {
      type: "shadow" as const,
      shadowStyle: { color: theme.splitLine },
    },
  };
}

function baseAxis(theme: PaletteTheme, kind: "category" | "value", isX: boolean) {
  return {
    type: kind,
    boundaryGap: kind === "category" ? true : undefined,
    axisLine: { lineStyle: { color: theme.axisLine, width: 1 } },
    axisTick: { show: false },
    axisLabel: {
      color: theme.mutedText,
      fontSize: 12,
      fontFamily: "var(--font-mono), ui-monospace, monospace",
      fontWeight: 500,
      hideOverlap: true,
      margin: 14,
      formatter: formatTick,
    },
    splitLine: {
      show: !isX,
      lineStyle: { color: theme.splitLine, type: "dashed" as const, width: 1 },
    },
    nameTextStyle: { color: theme.mutedText, fontSize: 12, fontWeight: 500 },
  };
}

function withDataZoom(theme: PaletteTheme, points: number) {
  if (points < 30) return undefined;
  return [
    {
      type: "inside" as const,
      throttle: 50,
      zoomOnMouseWheel: true,
      moveOnMouseWheel: false,
      moveOnMouseMove: true,
    },
    {
      type: "slider" as const,
      height: 16,
      bottom: 6,
      backgroundColor: "transparent",
      borderColor: "transparent",
      fillerColor: theme.splitLine,
      handleStyle: { color: theme.primary, borderColor: theme.primary },
      moveHandleStyle: { color: theme.primary },
      textStyle: { color: theme.mutedText, fontSize: 10 },
    },
  ];
}

function buildOption(
  result: QueryResultPayload,
  config: ChartConfig,
  theme: PaletteTheme,
) {
  const rows = result.rows;
  if (!rows.length) return null;
  const type = config.chart_type;
  const yField = Array.isArray(config.y) ? config.y[0] : config.y;
  const userOpts = readOptions(config);
  // Resolve every customizable knob to a concrete value, falling back to
  // defaults. `showDataLabels` intentionally stays undefined so the bar
  // case can still apply its data-density heuristic.
  const opts = {
    palette: userOpts.palette ?? DEFAULT_OPTIONS.palette,
    height: userOpts.height ?? DEFAULT_OPTIONS.height,
    yFormat: userOpts.yFormat ?? DEFAULT_OPTIONS.yFormat,
    showLegend: userOpts.showLegend ?? DEFAULT_OPTIONS.showLegend,
    showGridlines: userOpts.showGridlines ?? DEFAULT_OPTIONS.showGridlines,
    smoothLines: userOpts.smoothLines ?? DEFAULT_OPTIONS.smoothLines,
    fillArea: userOpts.fillArea ?? DEFAULT_OPTIONS.fillArea,
    showDataLabels: userOpts.showDataLabels,
  };
  // No internal ECharts title — the chart card renders a richer HTML
  // header above the canvas with title, auto-generated description,
  // and metadata. Keeping a redundant title inside the canvas would
  // duplicate the typography and waste vertical space.
  const title = undefined;

  if (type === "kpi" && yField) {
    return buildKPIOption(rows, yField, config.title ?? yField, theme);
  }

  if (!config.x || !yField) return null;
  const data = aggregate(rows, config.x, yField, config.aggregation);
  const xValues = data.map((d) => d.x);
  const yValues = data.map((d) => d.y);
  const treatXAsTime =
    type === "time_series" ||
    (xValues.length > 0 && xValues.every(isDateLike));

  // No internal title — start the plot area near the top of the canvas
  // since the HTML chart-card header above already carries the title.
  const baseGrid = {
    left: 56,
    right: 24,
    top: 18,
    bottom: (data.length >= 30 ? 44 : 28) + (opts.showLegend ? 28 : 0),
    containLabel: true,
  };

  const yFormatter = makeYFormatter(opts.yFormat);
  const yAxisBase = baseAxis(theme, "value", false);
  const yAxis = {
    ...yAxisBase,
    splitLine: { ...yAxisBase.splitLine, show: opts.showGridlines },
    axisLabel: { ...yAxisBase.axisLabel, formatter: yFormatter },
  };

  const legend = opts.showLegend
    ? {
        show: true,
        bottom: data.length >= 30 ? 32 : 8,
        textStyle: { color: theme.mutedText, fontSize: 12, fontWeight: 500 },
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        icon: "circle" as const,
      }
    : undefined;

  const xAxis = treatXAsTime
    ? {
        ...baseAxis(theme, "value", true),
        type: "time" as const,
        axisLabel: {
          ...baseAxis(theme, "value", true).axisLabel,
          formatter: (v: number) => {
            const d = new Date(v);
            return Number.isNaN(d.getTime())
              ? ""
              : d.toLocaleDateString(undefined, {
                  month: "short",
                  day: "2-digit",
                });
          },
        },
      }
    : { ...baseAxis(theme, "category", true), data: xValues };

  const tooltip = baseTooltip(theme);
  const dataZoom = withDataZoom(theme, data.length);

  const lineSeries = (smooth: boolean, area: boolean) => ({
    type: "line" as const,
    smooth,
    smoothMonotone: "x" as const,
    showSymbol: data.length <= 60,
    symbolSize: 8,
    sampling: "lttb" as const,
    data: treatXAsTime
      ? data.map((d) => [new Date(d.x).getTime(), d.y])
      : yValues,
    lineStyle: { width: 3, color: theme.primary, cap: "round" as const, join: "round" as const },
    itemStyle: { color: theme.primary, borderColor: theme.surface, borderWidth: 2.5 },
    emphasis: {
      focus: "series" as const,
      itemStyle: { borderWidth: 3.5 },
      lineStyle: { width: 3.5 },
    },
    areaStyle: area
      ? {
          opacity: 0.85,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${theme.primary}55` },
              { offset: 1, color: `${theme.primary}00` },
            ],
          },
        }
      : undefined,
  });

  switch (type) {
    case "line":
    case "time_series":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        legend,
        tooltip: { ...tooltip, valueFormatter: formatFull },
        grid: baseGrid,
        xAxis,
        yAxis,
        dataZoom,
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
        series: [lineSeries(opts.smoothLines, opts.fillArea)],
      };

    case "area":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        legend,
        tooltip: { ...tooltip, valueFormatter: formatFull },
        grid: baseGrid,
        xAxis,
        yAxis,
        dataZoom,
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
        series: [lineSeries(opts.smoothLines, true)],
      };

    case "bar":
    case "histogram":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        legend,
        tooltip: { ...tooltip, valueFormatter: formatFull },
        grid: baseGrid,
        xAxis,
        yAxis,
        dataZoom,
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
        series: [
          {
            type: "bar" as const,
            data: yValues,
            barMaxWidth: 48,
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: theme.primary },
                  { offset: 1, color: `${theme.primary}55` },
                ],
              },
              shadowBlur: 6,
              shadowColor: `${theme.primary}22`,
              shadowOffsetY: 2,
            },
            emphasis: {
              focus: "series" as const,
              itemStyle: {
                shadowBlur: 18,
                shadowColor: `${theme.primary}77`,
              },
            },
            label:
              (
                opts.showDataLabels === undefined
                  ? yValues.length <= 14
                  : opts.showDataLabels
              )
                ? {
                    show: true,
                    position: "top" as const,
                    color: theme.text,
                    fontSize: 12,
                    fontWeight: 600,
                    formatter: (p: { value: number }) =>
                      yFormatter(p.value),
                  }
                : { show: false },
          },
        ],
      };

    case "stacked_bar":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        legend,
        tooltip,
        grid: baseGrid,
        xAxis,
        yAxis,
        dataZoom,
        series: [
          {
            type: "bar" as const,
            stack: "total",
            data: yValues,
            barMaxWidth: 36,
            itemStyle: { borderRadius: [4, 4, 0, 0] },
          },
        ],
      };

    case "scatter":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        tooltip: {
          ...tooltip,
          trigger: "item" as const,
          formatter: (p: { value: [number, number] }) =>
            `<div style="font-weight:600">${formatFull(p.value[0])}</div>` +
            `<div style="color:${theme.mutedText};font-size:11px">${formatFull(p.value[1])}</div>`,
        },
        grid: baseGrid,
        xAxis: baseAxis(theme, "value", true),
        yAxis,
        series: [
          {
            type: "scatter" as const,
            data: data.map((d) => [Number(d.x) || 0, d.y]),
            symbolSize: 14,
            itemStyle: {
              color: theme.primary,
              opacity: 0.8,
              borderColor: theme.surface,
              borderWidth: 2,
              shadowBlur: 14,
              shadowColor: `${theme.primary}55`,
            },
            emphasis: {
              itemStyle: { opacity: 1, shadowBlur: 24, shadowColor: `${theme.primary}88` },
              scale: 1.15,
            },
          },
        ],
      };

    case "pie":
    case "donut": {
      const total = data.reduce((a, b) => a + b.y, 0);
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        tooltip: {
          ...tooltip,
          trigger: "item" as const,
          formatter: (p: { name: string; value: number; percent: number }) =>
            `<div style="font-weight:600">${p.name}</div>` +
            `<div style="color:${theme.mutedText};font-size:11px">${formatFull(p.value)} · ${p.percent.toFixed(1)}%</div>`,
        },
        legend: {
          orient: "vertical" as const,
          right: 20,
          top: "middle" as const,
          textStyle: { color: theme.mutedText, fontSize: 12, fontWeight: 500 },
          itemWidth: 12,
          itemHeight: 12,
          itemGap: 10,
          icon: "circle",
        },
        series: [
          {
            type: "pie" as const,
            radius: type === "donut" ? ["52%", "82%"] : [0, "76%"],
            center: ["38%", "52%"],
            avoidLabelOverlap: true,
            padAngle: 3,
            itemStyle: {
              borderColor: isDarkSurface(theme) ? "#0b0d12" : "#ffffff",
              borderWidth: 3,
              borderRadius: 8,
              shadowBlur: 8,
              shadowColor: "rgba(0,0,0,0.12)",
            },
            label: {
              show: type === "pie" && data.length <= 8,
              color: theme.text,
              fontSize: 12,
              fontWeight: 500,
              formatter: "{b}\n{d}%",
            },
            labelLine: { length: 14, length2: 10, smooth: true },
            emphasis: {
              scale: true,
              scaleSize: 8,
              itemStyle: { shadowBlur: 24, shadowColor: `${theme.primary}77` },
            },
            data: data.map((d, i) => ({
              name: d.x,
              value: d.y,
              itemStyle: { color: theme.palette[i % theme.palette.length] },
            })),
            ...(type === "donut"
              ? {
                  graphic: {
                    type: "text",
                    left: "center",
                    top: "center",
                    style: {
                      text: `${formatTick(total)}\nTotal`,
                      textAlign: "center",
                      fontSize: 18,
                      fontWeight: 600,
                      fill: theme.text,
                      lineHeight: 22,
                    },
                  },
                }
              : {}),
          },
        ],
      };
    }

    case "heatmap":
      return buildHeatmapOption(data, theme, title);

    case "box":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        tooltip,
        grid: baseGrid,
        xAxis,
        yAxis,
        series: [
          {
            type: "bar" as const,
            data: yValues,
            itemStyle: { color: theme.primary, borderRadius: [4, 4, 0, 0] },
          },
        ],
      };

    default:
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        tooltip,
        grid: baseGrid,
        xAxis,
        yAxis,
        series: [
          {
            type: "bar" as const,
            data: yValues,
            itemStyle: { color: theme.primary, borderRadius: [4, 4, 0, 0] },
          },
        ],
      };
  }
}

function isDarkSurface(theme: PaletteTheme): boolean {
  return theme.text.startsWith("rgba(226");
}

function buildKPIOption(
  rows: Record<string, unknown>[],
  yField: string,
  label: string,
  theme: PaletteTheme,
) {
  const nums: number[] = [];
  for (const r of rows) {
    const n = Number(r[yField]);
    if (Number.isFinite(n)) nums.push(n);
  }
  const total = nums.reduce((a, b) => a + b, 0);
  // Sparkline of the last 60 points for context — a single number with no
  // trend is much less useful than the same number with a tiny shape next
  // to it.
  const spark = nums.slice(-60);
  return {
    backgroundColor: theme.surface,
    grid: { left: 16, right: 16, top: 90, bottom: 14, containLabel: false },
    xAxis: {
      type: "category" as const,
      show: false,
      boundaryGap: false,
      data: spark.map((_, i) => i),
    },
    yAxis: { type: "value" as const, show: false, scale: true },
    series: [
      {
        type: "line" as const,
        data: spark,
        smooth: true,
        showSymbol: false,
        lineStyle: { color: theme.primary, width: 2 },
        areaStyle: {
          opacity: 0.7,
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${theme.primary}55` },
              { offset: 1, color: `${theme.primary}00` },
            ],
          },
        },
      },
    ],
    graphic: [
      {
        type: "text",
        left: 24,
        top: 18,
        style: {
          text: label.toUpperCase(),
          fontSize: 11,
          fontWeight: 600,
          fill: theme.mutedText,
          letterSpacing: 1.6,
        },
      },
      {
        type: "text",
        left: 22,
        top: 38,
        style: {
          text: total.toLocaleString(undefined, { maximumFractionDigits: 2 }),
          fontSize: 44,
          fontWeight: 700,
          fill: theme.text,
        },
      },
      {
        type: "text",
        right: 24,
        top: 40,
        style: {
          text: `n=${nums.length}`,
          fontSize: 11,
          fill: theme.mutedText,
        },
      },
    ],
  };
}

function buildHeatmapOption(
  data: { x: string; y: number }[],
  theme: PaletteTheme,
  title: { text: string } | undefined,
) {
  // Plain x/y heatmap from a (label, value) series — bucket into 12 columns
  // for a calendar-style look. Falls back to a categorical bar when the
  // input doesn't have enough structure.
  const xs = data.map((d) => d.x);
  const ys = data.map((d) => d.y);
  const max = Math.max(0, ...ys);
  const min = Math.min(0, ...ys);
  return {
    backgroundColor: theme.surface,
    title,
    tooltip: {
      ...baseTooltip(theme),
      trigger: "item" as const,
      formatter: (p: { value: [number, number, number]; name: string }) =>
        `<div style="font-weight:600">${xs[p.value[0]] ?? p.name}</div>` +
        `<div style="color:${theme.mutedText};font-size:11px">${formatFull(p.value[2])}</div>`,
    },
    grid: { left: 60, right: 24, top: title ? 56 : 28, bottom: 56 },
    xAxis: { ...baseAxis(theme, "category", true), data: xs, splitArea: { show: true } },
    yAxis: { ...baseAxis(theme, "category", false), data: [""], splitArea: { show: true } },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: "horizontal" as const,
      left: "center",
      bottom: 12,
      inRange: { color: [`${theme.primary}22`, theme.primary] },
      textStyle: { color: theme.mutedText, fontSize: 10 },
    },
    series: [
      {
        type: "heatmap" as const,
        data: ys.map((y, i) => [i, 0, y]),
        progressive: 1000,
        animation: false,
        itemStyle: { borderRadius: 4, borderColor: theme.surface, borderWidth: 1 },
        emphasis: { itemStyle: { shadowBlur: 12, shadowColor: theme.primary } },
      },
    ],
  };
}
