"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartView } from "@/components/notebook/chart-view";
import { ChartBuilder } from "@/components/notebook/chart-builder";
import { ProfileView } from "@/components/notebook/profile-view";

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

export function ResultTabs({ cell, result }: { cell: SQLCell; result: QueryResultPayload }) {
  const updateCell = useNotebookStore((s) => s.updateCell);
  const chartConfig = cell.chart_config ?? DEFAULT_CHART;

  const onChangeChart = (next: ChartConfig) =>
    updateCell(cell.id, (c) => (c.cell_type === "sql" ? { ...c, chart_config: next } : c));

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
        <ChartBuilder result={result} config={chartConfig} onChange={onChangeChart} />
        <ChartView result={result} config={chartConfig} onChange={onChangeChart} />
      </TabsContent>
    </Tabs>
  );
}
