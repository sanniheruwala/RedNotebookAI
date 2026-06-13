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
import {
  copyChartPngToClipboard,
  downloadChartPng,
  downloadChartSvg,
  downloadResultCsv,
} from "@/lib/chart-export";
import type { ChartConfig, QueryResultPayload } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

// Brand-aligned categorical palette — warm primary anchor with cool
// supporting tones so 6+ series remain distinguishable without looking
// like a default 2010 line chart.
const PALETTE_DARK = [
  "#f43f5e",
  "#22d3ee",
  "#a78bfa",
  "#34d399",
  "#fbbf24",
  "#60a5fa",
  "#f472b6",
  "#fb923c",
];
const PALETTE_LIGHT = [
  "#e11d48",
  "#0891b2",
  "#7c3aed",
  "#059669",
  "#d97706",
  "#2563eb",
  "#db2777",
  "#ea580c",
];

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

function buildTheme(isDark: boolean): PaletteTheme {
  if (isDark) {
    return {
      palette: PALETTE_DARK,
      primary: "#f43f5e",
      axisLine: "rgba(148, 163, 184, 0.25)",
      splitLine: "rgba(148, 163, 184, 0.10)",
      text: "rgba(226, 232, 240, 0.92)",
      mutedText: "rgba(148, 163, 184, 0.85)",
      tooltipBg: "rgba(15, 23, 42, 0.94)",
      tooltipBorder: "rgba(244, 63, 94, 0.35)",
      surface: "transparent",
    };
  }
  return {
    palette: PALETTE_LIGHT,
    primary: "#e11d48",
    axisLine: "rgba(15, 23, 42, 0.18)",
    splitLine: "rgba(15, 23, 42, 0.06)",
    text: "rgba(15, 23, 42, 0.92)",
    mutedText: "rgba(71, 85, 105, 0.85)",
    tooltipBg: "rgba(255, 255, 255, 0.98)",
    tooltipBorder: "rgba(225, 29, 72, 0.25)",
    surface: "transparent",
  };
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
}: {
  result: QueryResultPayload;
  config: ChartConfig;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const theme = React.useMemo(() => buildTheme(isDark), [isDark]);
  const echartsInstanceRef = React.useRef<EChartsType | null>(null);

  const option = React.useMemo(
    () => buildOption(result, config, theme),
    [result, config, theme],
  );

  if (!option) {
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

  return (
    <div
      className={`group relative overflow-hidden rounded-2xl border bg-card ring-1 ring-inset ${
        isDark
          ? "border-border/60 ring-white/5 shadow-[0_18px_48px_-24px_rgba(0,0,0,0.55)]"
          : "border-border ring-black/[0.03] shadow-[0_18px_40px_-20px_rgba(15,23,42,0.18)]"
      }`}
    >
      <ChartDownloadMenu
        getInstance={() => echartsInstanceRef.current}
        result={result}
        config={config}
      />
      <ReactECharts
        option={option}
        style={{ height: 460, width: "100%" }}
        notMerge
        lazyUpdate
        opts={useSvg ? { renderer: "svg" } : { renderer: "canvas", devicePixelRatio: dpr }}
        theme={isDark ? "dark" : undefined}
        onChartReady={(instance) => {
          echartsInstanceRef.current = instance as EChartsType;
        }}
      />
    </div>
  );
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
    <div
      className={`pointer-events-none absolute right-3 top-3 z-10 transition-opacity ${
        open ? "opacity-100" : "opacity-60 group-hover:opacity-100"
      }`}
    >
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy !== null}
            className="pointer-events-auto h-8 gap-1.5 rounded-lg border-border/70 bg-card/85 px-2.5 text-[11.5px] font-medium shadow-sm backdrop-blur-md hover:bg-card"
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
          className="w-56 pointer-events-auto"
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
  const title = config.title
    ? {
        text: config.title,
        left: 20,
        top: 16,
        textStyle: {
          color: theme.text,
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: -0.2,
        },
      }
    : undefined;

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

  const baseGrid = {
    left: 56,
    right: 24,
    top: title ? 56 : 28,
    bottom: data.length >= 30 ? 44 : 32,
    containLabel: true,
  };

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
        tooltip: { ...tooltip, valueFormatter: formatFull },
        grid: baseGrid,
        xAxis,
        yAxis: baseAxis(theme, "value", false),
        dataZoom,
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
        series: [lineSeries(true, false)],
      };

    case "area":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        tooltip: { ...tooltip, valueFormatter: formatFull },
        grid: baseGrid,
        xAxis,
        yAxis: baseAxis(theme, "value", false),
        dataZoom,
        animationDuration: 600,
        animationEasing: "cubicOut" as const,
        series: [lineSeries(true, true)],
      };

    case "bar":
    case "histogram":
      return {
        color: theme.palette,
        backgroundColor: theme.surface,
        title,
        tooltip: { ...tooltip, valueFormatter: formatFull },
        grid: baseGrid,
        xAxis,
        yAxis: baseAxis(theme, "value", false),
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
              yValues.length <= 14
                ? {
                    show: true,
                    position: "top" as const,
                    color: theme.text,
                    fontSize: 12,
                    fontWeight: 600,
                    formatter: (p: { value: number }) => formatTick(p.value),
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
        tooltip,
        grid: baseGrid,
        xAxis,
        yAxis: baseAxis(theme, "value", false),
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
        yAxis: baseAxis(theme, "value", false),
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
        yAxis: baseAxis(theme, "value", false),
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
        yAxis: baseAxis(theme, "value", false),
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
