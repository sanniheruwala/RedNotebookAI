"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ChartView } from "@/components/notebook/chart-view";
import { ChartBuilder } from "@/components/notebook/chart-builder";
import { ProfileView } from "@/components/notebook/profile-view";
import { computeAggregatedStats } from "@/lib/result-stats";

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
import { api } from "@/lib/api";

const DEFAULT_CHART: ChartConfig = { chart_type: "bar", x: null, y: null };

export function ResultTabs({ cell, result }: { cell: SQLCell; result: QueryResultPayload }) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const chartConfig = cell.chart_config ?? DEFAULT_CHART;
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);

  const summarize = useMutation({
    mutationFn: () =>
      api.aiExplainResult({
        sql: cell.sql,
        columns: result.columns,
        sample_rows: result.rows.slice(0, 20),
        row_count: result.row_count,
        aggregated_stats: computeAggregatedStats(result),
      }),
    onSuccess: (res) => setAiSummary(res.text),
    onError: (err: Error) => toast.error(err.message),
  });

  const onChangeChart = (next: ChartConfig) =>
    updateCell(cell.id, (c) => (c.cell_type === "sql" ? { ...c, chart_config: next } : c));

  return (
    <Tabs defaultValue="table" className="mt-3">
      <TabsList>
        <TabsTrigger value="table">Table</TabsTrigger>
        <TabsTrigger value="profile">Profile</TabsTrigger>
        <TabsTrigger value="chart">Chart</TabsTrigger>
        <TabsTrigger value="ai">AI</TabsTrigger>
      </TabsList>
      <TabsContent value="table">
        <ResultTable result={result} />
      </TabsContent>
      <TabsContent value="profile">
        <ProfileView result={result} />
      </TabsContent>
      <TabsContent value="chart" className="space-y-3">
        <ChartBuilder result={result} config={chartConfig} onChange={onChangeChart} />
        <ChartView result={result} config={chartConfig} />
      </TabsContent>
      <TabsContent value="ai" className="space-y-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => summarize.mutate()}
          disabled={summarize.isPending}
          className="gap-2"
        >
          {summarize.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {summarize.isPending ? "Summarizing…" : "Summarize result"}
        </Button>
        {summarize.isPending && !aiSummary && (
          <div className="flex items-center gap-2 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            AI is summarizing your result…
          </div>
        )}
        {aiSummary && (
          <div className="rounded-xl border bg-card p-4">
            <Markdown variant="cell">{aiSummary}</Markdown>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
