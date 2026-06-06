"use client";

import * as React from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Wand2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ChartConfig, QueryResultPayload } from "@/lib/types";

const CHART_TYPES = [
  "bar",
  "line",
  "area",
  "stacked_bar",
  "scatter",
  "pie",
  "donut",
  "heatmap",
  "histogram",
  "box",
  "time_series",
  "kpi",
  "table",
];

export function ChartBuilder({
  result,
  config,
  onChange,
}: {
  result: QueryResultPayload;
  config: ChartConfig;
  onChange: (next: ChartConfig) => void;
}) {
  const columnNames = result.columns.map((c) => c.name);

  const suggest = useMutation({
    mutationFn: () =>
      api.chartSuggest({
        columns: result.columns,
        sample_rows: result.rows.slice(0, 20),
        row_count: result.row_count,
      }),
    onSuccess: (res) => {
      const s = res.suggestion;
      onChange({
        ...config,
        chart_type: s.chart_type,
        x: s.x ?? null,
        y: (Array.isArray(s.y) ? s.y[0] : s.y) ?? null,
        color: s.color ?? null,
        aggregation: s.aggregation ?? null,
        title: s.title ?? config.title ?? null,
      });
      toast.success(`Suggested: ${s.chart_type}`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/20 p-3 md:grid-cols-4">
      <Field label="Chart">
        <Select value={config.chart_type} onChange={(e) => onChange({ ...config, chart_type: e.target.value })}>
          {CHART_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="X axis">
        <ColumnSelect value={config.x ?? ""} columns={columnNames} onChange={(v) => onChange({ ...config, x: v || null })} />
      </Field>
      <Field label="Y axis">
        <ColumnSelect
          value={(Array.isArray(config.y) ? config.y[0] : config.y) ?? ""}
          columns={columnNames}
          onChange={(v) => onChange({ ...config, y: v || null })}
        />
      </Field>
      <Field label="Aggregation">
        <Select
          value={config.aggregation ?? ""}
          onChange={(e) => onChange({ ...config, aggregation: e.target.value || null })}
        >
          <option value="">none</option>
          <option value="sum">sum</option>
          <option value="avg">avg</option>
          <option value="min">min</option>
          <option value="max">max</option>
          <option value="count">count</option>
        </Select>
      </Field>
      <Field label="Title" className="col-span-2">
        <Input value={config.title ?? ""} onChange={(e) => onChange({ ...config, title: e.target.value || null })} />
      </Field>
      <div className="col-span-2 flex items-end justify-end">
        <Button size="sm" variant="secondary" onClick={() => suggest.mutate()} disabled={suggest.isPending}>
          <Wand2 className="h-4 w-4" /> Auto-suggest
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
      <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function ColumnSelect({
  value,
  columns,
  onChange,
}: {
  value: string;
  columns: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">none</option>
      {columns.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </Select>
  );
}
