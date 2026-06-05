"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ResultTable } from "@/components/notebook/result-table";
import { ChartView } from "@/components/notebook/chart-view";
import { ChartBuilder } from "@/components/notebook/chart-builder";
import { ProfileView } from "@/components/notebook/profile-view";
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
        aggregated_stats: {},
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
        <Button size="sm" variant="secondary" onClick={() => summarize.mutate()} disabled={summarize.isPending}>
          <Sparkles className="h-4 w-4" /> Summarize result
        </Button>
        {aiSummary && (
          <div className="prose prose-sm dark:prose-invert max-w-none rounded-xl border bg-card p-4">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary}</ReactMarkdown>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}
