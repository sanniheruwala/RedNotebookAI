"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type { ChartConfig, QueryResultPayload } from "@/lib/types";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

function aggregate(
  rows: Record<string, unknown>[],
  xKey: string,
  yKey: string,
  aggregation: string | null | undefined
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

export function ChartView({
  result,
  config,
}: {
  result: QueryResultPayload;
  config: ChartConfig;
}) {
  const option = React.useMemo(() => buildOption(result, config), [result, config]);
  if (!option) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        Configure x and y axes to render a chart.
      </div>
    );
  }
  return (
    <div className="rounded-xl border bg-card p-3">
      <ReactECharts option={option} style={{ height: 360, width: "100%" }} notMerge lazyUpdate />
    </div>
  );
}

function buildOption(result: QueryResultPayload, config: ChartConfig) {
  const rows = result.rows;
  if (!rows.length) return null;
  const type = config.chart_type;

  const yField = Array.isArray(config.y) ? config.y[0] : config.y;

  if (type === "kpi" && yField) {
    const value = rows.reduce((a, r) => a + (Number(r[yField]) || 0), 0);
    return {
      backgroundColor: "transparent",
      graphic: [
        {
          type: "text",
          left: "center",
          top: "40%",
          style: { text: String(value.toLocaleString()), fontSize: 64, fontWeight: 700, fill: "#e11d48" },
        },
        {
          type: "text",
          left: "center",
          top: "62%",
          style: { text: config.title ?? yField, fontSize: 14, fill: "#94a3b8" },
        },
      ],
    };
  }

  if (!config.x || !yField) return null;
  const data = aggregate(rows, config.x, yField, config.aggregation);

  const base = {
    backgroundColor: "transparent",
    title: config.title ? { text: config.title, left: "left" } : undefined,
    tooltip: { trigger: type === "scatter" ? "item" : "axis" },
    grid: { left: 50, right: 24, top: config.title ? 50 : 30, bottom: 40 },
    xAxis: { type: "category" as const, data: data.map((d) => d.x), axisLine: { lineStyle: { color: "#475569" } } },
    yAxis: { type: "value" as const, axisLine: { lineStyle: { color: "#475569" } } },
  };

  switch (type) {
    case "line":
    case "time_series":
      return { ...base, series: [{ type: "line", smooth: true, data: data.map((d) => d.y), itemStyle: { color: "#e11d48" } }] };
    case "area":
      return {
        ...base,
        series: [
          {
            type: "line",
            smooth: true,
            areaStyle: { opacity: 0.3 },
            data: data.map((d) => d.y),
            itemStyle: { color: "#e11d48" },
          },
        ],
      };
    case "bar":
      return { ...base, series: [{ type: "bar", data: data.map((d) => d.y), itemStyle: { color: "#e11d48" } }] };
    case "stacked_bar":
      return { ...base, series: [{ type: "bar", stack: "total", data: data.map((d) => d.y), itemStyle: { color: "#e11d48" } }] };
    case "scatter":
      return {
        ...base,
        xAxis: { type: "value" as const },
        series: [{ type: "scatter", data: data.map((d) => [Number(d.x) || 0, d.y]) }],
      };
    case "pie":
    case "donut":
      return {
        backgroundColor: "transparent",
        title: config.title ? { text: config.title, left: "left" } : undefined,
        tooltip: { trigger: "item" },
        series: [
          {
            type: "pie",
            radius: type === "donut" ? ["40%", "70%"] : "70%",
            data: data.map((d) => ({ name: d.x, value: d.y })),
          },
        ],
      };
    case "histogram":
      return { ...base, series: [{ type: "bar", data: data.map((d) => d.y) }] };
    default:
      return { ...base, series: [{ type: "bar", data: data.map((d) => d.y) }] };
  }
}
