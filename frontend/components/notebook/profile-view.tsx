"use client";

import * as React from "react";
import type { QueryResultPayload } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";

type ColumnStats = {
  name: string;
  data_type: string;
  null_count: number;
  null_percent: number;
  distinct_count: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
};

function summarize(result: QueryResultPayload): ColumnStats[] {
  return result.columns.map((col) => {
    const values = result.rows.map((r) => r[col.name]);
    const nulls = values.filter((v) => v === null || v === undefined).length;
    const distinct = new Set(values.map((v) => (typeof v === "object" && v ? JSON.stringify(v) : v))).size;
    const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    let min: number | null = null,
      max: number | null = null,
      mean: number | null = null;
    if (nums.length) {
      min = Math.min(...nums);
      max = Math.max(...nums);
      mean = nums.reduce((a, b) => a + b, 0) / nums.length;
    }
    return {
      name: col.name,
      data_type: col.data_type,
      null_count: nulls,
      null_percent: result.rows.length ? (nulls / result.rows.length) * 100 : 0,
      distinct_count: distinct,
      min,
      max,
      mean,
    };
  });
}

export function ProfileView({ result }: { result: QueryResultPayload }) {
  const stats = React.useMemo(() => summarize(result), [result]);
  return (
    <div className="rounded-xl border bg-card">
      <ScrollArea className="scrollbar-thin max-h-[420px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-muted/50">
            <tr>
              {["Column", "Type", "Nulls", "Null %", "Distinct", "Min", "Max", "Mean"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stats.map((c) => (
              <tr key={c.name} className="border-b last:border-0 even:bg-muted/20">
                <td className="px-3 py-1.5 font-medium">{c.name}</td>
                <td className="px-3 py-1.5 font-mono text-muted-foreground">{c.data_type}</td>
                <td className="px-3 py-1.5">{c.null_count}</td>
                <td className="px-3 py-1.5">{c.null_percent.toFixed(1)}%</td>
                <td className="px-3 py-1.5">{c.distinct_count}</td>
                <td className="px-3 py-1.5">{c.min ?? "—"}</td>
                <td className="px-3 py-1.5">{c.max ?? "—"}</td>
                <td className="px-3 py-1.5">{c.mean !== null ? c.mean.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
