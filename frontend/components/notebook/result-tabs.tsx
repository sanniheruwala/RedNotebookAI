"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ArrowLeft, LayoutGrid, Loader2, Plus, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ChartView } from "@/components/notebook/chart-view";
import { ChartBuilder } from "@/components/notebook/chart-builder";
import { ProfileView } from "@/components/notebook/profile-view";
import {
  recommendCharts,
  type ChartRecommendation,
} from "@/lib/chart-recommender";

const ResultTable = dynamic(
  () => import("@/components/notebook/result-table").then((m) => m.ResultTable),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-48 items-center justify-center rounded-xl border bg-muted/20 text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> Loading table…
      </div>
    ),
  }
);
import type { ChartConfig, QueryResultPayload, SQLCell } from "@/lib/types";
import { useNotebookStore } from "@/store/notebook-store";

const DEFAULT_CHART: ChartConfig = { chart_type: "bar", x: null, y: null };

/** Treat the placeholder default as "no chart picked yet". */
function isUnconfigured(cfg: ChartConfig | null | undefined): boolean {
  if (!cfg) return true;
  return !cfg.x && !cfg.y;
}

type ChartMode = "grid" | "full" | "custom";

export function ResultTabs({
  cell,
  result,
}: {
  cell: SQLCell;
  result: QueryResultPayload;
}) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const chartConfig = cell.chart_config ?? DEFAULT_CHART;

  const onChangeChart = (next: ChartConfig) =>
    updateCell(cell.id, (c) =>
      c.cell_type === "sql" ? { ...c, chart_config: next } : c,
    );

  return (
    <Tabs defaultValue="table" className="mt-3">
      <TabsList>
        <TabsTrigger value="table">Table</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="chart">Chart</TabsTrigger>
      </TabsList>
      <TabsContent value="table">
        <ResultTable result={result} />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileView result={result} />
      </TabsContent>
      <TabsContent value="chart" className="space-y-3">
        <ChartTab
          result={result}
          chartConfig={chartConfig}
          onChangeChart={onChangeChart}
        />
      </TabsContent>
    </Tabs>
  );
}

/**
 * Chart tab with three modes:
 *   - "grid": shows a 2×2 grid of recommended chart thumbnails, plus a
 *     "Custom" tile. Default when no chart is configured yet.
 *   - "full": the picked chart shown full-size, with a "← Suggestions"
 *     header so the user can come back. Default once a chart is set.
 *   - "custom": opens the existing axis-picker for full control.
 */
function ChartTab({
  result,
  chartConfig,
  onChangeChart,
}: {
  result: QueryResultPayload;
  chartConfig: ChartConfig;
  onChangeChart: (next: ChartConfig) => void;
}) {
  // 8 candidates from the recommender, paged through 4 at a time.
  const allRecommendations = React.useMemo(
    () => recommendCharts(result, 8),
    [result],
  );
  const [page, setPage] = React.useState(0);

  // Initial mode: grid if the cell has never picked a chart, otherwise show
  // the full-size view. Toggled by the user from there.
  const [mode, setMode] = React.useState<ChartMode>(() =>
    isUnconfigured(chartConfig) ? "grid" : "full",
  );

  const pageSize = 4;
  const pageCount = Math.max(1, Math.ceil(allRecommendations.length / pageSize));
  const currentPage = page % pageCount;
  const visible = allRecommendations.slice(
    currentPage * pageSize,
    currentPage * pageSize + pageSize,
  );

  const pickRecommendation = (rec: ChartRecommendation) => {
    onChangeChart(rec.config);
    setMode("full");
  };

  if (mode === "grid") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3 text-primary" />
            <span>
              Chart suggestions based on your result. Pick one or build a
              custom chart.
            </span>
          </div>
          {pageCount > 1 && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-[11px]"
              onClick={() => setPage((p) => p + 1)}
            >
              Try another set ({currentPage + 1}/{pageCount})
            </Button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((rec, idx) => (
            <ThumbCard
              key={`${currentPage}-${idx}`}
              result={result}
              rec={rec}
              onClick={() => pickRecommendation(rec)}
            />
          ))}
          <CustomTile onClick={() => setMode("custom")} />
        </div>
      </div>
    );
  }

  if (mode === "custom") {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setMode("grid")}
            className="h-7 gap-1 text-[11px]"
          >
            <ArrowLeft className="h-3 w-3" /> Back to suggestions
          </Button>
        </div>
        <ChartBuilder result={result} config={chartConfig} onChange={onChangeChart} />
        {!isUnconfigured(chartConfig) && (
          <ChartView result={result} config={chartConfig} onChange={onChangeChart} />
        )}
      </div>
    );
  }

  // mode === "full"
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMode("grid")}
          className="h-7 gap-1 text-[11px]"
        >
          <LayoutGrid className="h-3 w-3" /> Suggestions
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMode("custom")}
          className="h-7 gap-1 text-[11px]"
        >
          Customize this chart
        </Button>
      </div>
      <ChartView result={result} config={chartConfig} onChange={onChangeChart} />
    </div>
  );
}

/** Single recommendation thumbnail. Renders a live (small) ECharts chart. */
function ThumbCard({
  result,
  rec,
  onClick,
}: {
  result: QueryResultPayload;
  rec: ChartRecommendation;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10"
    >
      <div className="h-[200px] w-full overflow-hidden bg-background/40">
        <div className="pointer-events-none h-full w-full">
          <ChartView result={result} config={rec.config} compact />
        </div>
      </div>
      <div className="border-t bg-muted/[0.05] px-3 py-2">
        <div className="text-[12.5px] font-semibold leading-snug tracking-tightish">
          {rec.label}
        </div>
        <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
          {rec.why}
        </div>
      </div>
    </button>
  );
}

function CustomTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/[0.04] p-6 text-center transition-colors hover:border-primary/40 hover:bg-primary/[0.04]"
    >
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
        <Plus className="h-4 w-4 text-primary" />
      </div>
      <div className="text-[12.5px] font-semibold tracking-tightish">
        Build a custom chart
      </div>
      <div className="text-[11px] text-muted-foreground">
        Pick the chart type, axes, and aggregation yourself.
      </div>
    </button>
  );
}
