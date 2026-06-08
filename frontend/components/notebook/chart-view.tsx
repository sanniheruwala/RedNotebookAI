"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
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

  return (
    <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <ReactECharts
        option={option}
        style={{ height: 380, width: "100%" }}
        notMerge
        lazyUpdate
        opts={{ renderer: "canvas" }}
        theme={isDark ? "dark" : undefined}
      />
    </div>
  );
}

function baseTooltip(theme: PaletteTheme) {
  return {
    trigger: "axis" as const,
    backgroundColor: theme.tooltipBg,
    borderColor: theme.tooltipBorder,
    borderWidth: 1,
    padding: [10, 12],
    textStyle: {
      color: theme.text,
      fontFamily: "var(--font-sans), -apple-system, sans-serif",
      fontSize: 12,
    },
    extraCssText:
      "backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 10px; box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);",
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
    axisLine: { lineStyle: { color: theme.axisLine } },
    axisTick: { show: false },
    axisLabel: {
      color: theme.mutedText,
      fontSize: 11,
      fontFamily: "var(--font-mono), ui-monospace, monospace",
      hideOverlap: true,
      margin: 12,
      formatter: formatTick,
    },
    splitLine: {
      show: !isX,
      lineStyle: { color: theme.splitLine, type: "dashed" as const },
    },
    nameTextStyle: { color: theme.mutedText, fontSize: 11 },
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
        left: 16,
        top: 14,
        textStyle: {
          color: theme.text,
          fontFamily: "var(--font-sans), sans-serif",
          fontSize: 14,
          fontWeight: 600,
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
    symbolSize: 6,
    sampling: "lttb" as const,
    data: treatXAsTime
      ? data.map((d) => [new Date(d.x).getTime(), d.y])
      : yValues,
    lineStyle: { width: 2.5, color: theme.primary },
    itemStyle: { color: theme.primary, borderColor: theme.surface, borderWidth: 2 },
    emphasis: {
      focus: "series" as const,
      itemStyle: { borderWidth: 3 },
      lineStyle: { width: 3 },
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
            barMaxWidth: 36,
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: theme.primary },
                  { offset: 1, color: `${theme.primary}66` },
                ],
              },
            },
            emphasis: {
              focus: "series" as const,
              itemStyle: {
                shadowBlur: 12,
                shadowColor: `${theme.primary}66`,
              },
            },
            label:
              yValues.length <= 14
                ? {
                    show: true,
                    position: "top" as const,
                    color: theme.mutedText,
                    fontSize: 11,
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
            symbolSize: 10,
            itemStyle: {
              color: theme.primary,
              opacity: 0.75,
              borderColor: theme.surface,
              borderWidth: 1.5,
              shadowBlur: 8,
              shadowColor: `${theme.primary}40`,
            },
            emphasis: { itemStyle: { opacity: 1 } },
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
          right: 16,
          top: "middle" as const,
          textStyle: { color: theme.mutedText, fontSize: 11 },
          itemWidth: 10,
          itemHeight: 10,
          icon: "circle",
        },
        series: [
          {
            type: "pie" as const,
            radius: type === "donut" ? ["48%", "76%"] : [0, "70%"],
            center: ["38%", "52%"],
            avoidLabelOverlap: true,
            padAngle: 2,
            itemStyle: {
              borderColor: isDarkSurface(theme) ? "#0b0d12" : "#ffffff",
              borderWidth: 2,
              borderRadius: 6,
            },
            label: {
              show: type === "pie" && data.length <= 8,
              color: theme.text,
              fontSize: 11,
              formatter: "{b}\n{d}%",
            },
            labelLine: { length: 12, length2: 8, smooth: true },
            emphasis: {
              scale: true,
              scaleSize: 6,
              itemStyle: { shadowBlur: 18, shadowColor: `${theme.primary}55` },
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
                      fontSize: 14,
                      fill: theme.mutedText,
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
