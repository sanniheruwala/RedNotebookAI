"use client";

import * as React from "react";
import { Network } from "lucide-react";
import type { QueryResultPayload } from "@/lib/types";
import { ScrollArea } from "@/components/ui/scroll-area";

type HistogramBin = { lo: number; hi: number; count: number };

type ColumnStats = {
  name: string;
  data_type: string;
  null_count: number;
  null_percent: number;
  distinct_count: number;
  min?: number | null;
  max?: number | null;
  mean?: number | null;
  median?: number | null;
  histogram?: HistogramBin[] | null;
};

type RelatedPair = { a: string; b: string; score: number };

const HIST_BINS = 10;

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((x, y) => x - y);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}

function buildHistogram(values: number[], bins = HIST_BINS): HistogramBin[] | null {
  if (!values.length) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return [{ lo, hi, count: values.length }];
  const width = (hi - lo) / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - lo) / width);
    if (idx >= bins) idx = bins - 1;
    counts[idx] += 1;
  }
  return counts.map((c, i) => ({ lo: lo + i * width, hi: lo + (i + 1) * width, count: c }));
}

// Discretise a column so we can run mutual-information against another
// column with the same length. Numeric columns get 8 equal-width buckets;
// categoricals collapse to the top-8 levels + an "OTHER" bucket. Null
// values get the sentinel -1 and are skipped in the MI sum.
function discretize(values: unknown[], bins = 8): number[] {
  const nums = values.filter(isNumber);
  if (nums.length >= Math.max(2, Math.floor(values.length * 0.5))) {
    const lo = Math.min(...nums);
    const hi = Math.max(...nums);
    if (lo === hi) return values.map((v) => (v == null ? -1 : 0));
    const width = (hi - lo) / bins;
    return values.map((v) => {
      if (v == null || !isNumber(v)) return -1;
      const idx = Math.min(bins - 1, Math.floor((v - lo) / width));
      return idx;
    });
  }
  const counts = new Map<string, number>();
  for (const v of values) {
    if (v == null) continue;
    const k = typeof v === "object" ? JSON.stringify(v) : String(v);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, bins);
  const idx = new Map(top.map(([k], i) => [k, i]));
  const otherIdx = top.length;
  return values.map((v) => {
    if (v == null) return -1;
    const k = typeof v === "object" ? JSON.stringify(v) : String(v);
    return idx.get(k) ?? otherIdx;
  });
}

function entropy(labels: number[]): number {
  const counts = new Map<number, number>();
  let n = 0;
  for (const l of labels) {
    if (l === -1) continue;
    counts.set(l, (counts.get(l) ?? 0) + 1);
    n += 1;
  }
  if (!n) return 0;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    if (p > 0) h -= p * Math.log(p);
  }
  return h;
}

function mutualInformation(a: number[], b: number[]): number {
  const joint = new Map<string, number>();
  const px = new Map<number, number>();
  const py = new Map<number, number>();
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === -1 || b[i] === -1) continue;
    const key = `${a[i]}|${b[i]}`;
    joint.set(key, (joint.get(key) ?? 0) + 1);
    px.set(a[i], (px.get(a[i]) ?? 0) + 1);
    py.set(b[i], (py.get(b[i]) ?? 0) + 1);
    n += 1;
  }
  if (!n || px.size < 2 || py.size < 2) return 0;
  let mi = 0;
  for (const [key, c] of joint.entries()) {
    const [xs, ys] = key.split("|");
    const x = Number(xs);
    const y = Number(ys);
    const pXY = c / n;
    const pX = (px.get(x) ?? 0) / n;
    const pY = (py.get(y) ?? 0) / n;
    if (pXY > 0) mi += pXY * Math.log(pXY / (pX * pY));
  }
  return Math.max(0, mi);
}

function findRelatedColumns(
  result: QueryResultPayload,
  maxColumns = 20,
  top = 8,
): RelatedPair[] {
  if (result.rows.length < 5) return [];
  const names = result.columns.slice(0, maxColumns).map((c) => c.name);
  if (names.length < 2) return [];
  const discrete = new Map<string, number[]>();
  const entropies = new Map<string, number>();
  for (const name of names) {
    const values = result.rows.map((r) => r[name]);
    const d = discretize(values);
    discrete.set(name, d);
    entropies.set(name, entropy(d));
  }
  const pairs: RelatedPair[] = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i];
      const b = names[j];
      const mi = mutualInformation(discrete.get(a)!, discrete.get(b)!);
      const denom = Math.min(entropies.get(a)!, entropies.get(b)!);
      if (denom <= 0) continue;
      const normalized = mi / denom;
      if (normalized < 0.05) continue;
      pairs.push({ a, b, score: Math.min(1, normalized) });
    }
  }
  pairs.sort((x, y) => y.score - x.score);
  return pairs.slice(0, top);
}

function summarize(result: QueryResultPayload): ColumnStats[] {
  return result.columns.map((col) => {
    const values = result.rows.map((r) => r[col.name]);
    const nulls = values.filter((v) => v === null || v === undefined).length;
    const distinct = new Set(
      values.map((v) => (typeof v === "object" && v ? JSON.stringify(v) : v)),
    ).size;
    const nums = values.map((v) => Number(v)).filter((n) => Number.isFinite(n));
    let min: number | null = null;
    let max: number | null = null;
    let mean: number | null = null;
    let med: number | null = null;
    let hist: HistogramBin[] | null = null;
    if (nums.length) {
      min = Math.min(...nums);
      max = Math.max(...nums);
      mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      med = median(nums);
      hist = buildHistogram(nums);
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
      median: med,
      histogram: hist,
    };
  });
}

function Sparkline({ bins }: { bins: HistogramBin[] | null | undefined }) {
  if (!bins || !bins.length) {
    return <span className="text-muted-foreground/40">—</span>;
  }
  const w = 96;
  const h = 22;
  const max = Math.max(...bins.map((b) => b.count), 1);
  const barW = w / bins.length;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Value distribution"
      className="overflow-visible"
    >
      {bins.map((b, i) => {
        const bh = Math.max(1, (b.count / max) * (h - 2));
        return (
          <rect
            key={i}
            x={i * barW + 0.5}
            y={h - bh}
            width={Math.max(0.5, barW - 1)}
            height={bh}
            rx={1}
            className="fill-primary/60"
          >
            <title>{`${b.lo.toPrecision(4)} – ${b.hi.toPrecision(4)}: ${b.count}`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function fmt(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "-";
  if (Math.abs(value) >= 1000 || Number.isInteger(value)) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return value.toFixed(2);
}

export function ProfileView({ result }: { result: QueryResultPayload }) {
  const stats = React.useMemo(() => summarize(result), [result]);
  const related = React.useMemo(() => findRelatedColumns(result), [result]);

  return (
    <div className="space-y-3">
      <div className="rounded-xl border bg-card">
        <ScrollArea className="scrollbar-thin max-h-[420px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/50">
              <tr>
                {[
                  "Column",
                  "Type",
                  "Nulls",
                  "Null %",
                  "Distinct",
                  "Min",
                  "Max",
                  "Mean",
                  "Median",
                  "Distribution",
                ].map((h) => (
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
                  <td className="px-3 py-1.5">{fmt(c.min)}</td>
                  <td className="px-3 py-1.5">{fmt(c.max)}</td>
                  <td className="px-3 py-1.5">{fmt(c.mean)}</td>
                  <td className="px-3 py-1.5">{fmt(c.median)}</td>
                  <td className="px-3 py-1.5">
                    <Sparkline bins={c.histogram} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>

      {related.length > 0 && (
        <div className="rounded-xl border bg-card">
          <div className="flex items-center gap-1.5 border-b bg-muted/30 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Network className="h-3 w-3" />
            Related columns
            <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-muted-foreground/60">
              normalised mutual information
            </span>
          </div>
          <ul className="divide-y">
            {related.map((p) => (
              <li
                key={`${p.a}-${p.b}`}
                className="flex items-center gap-3 px-3 py-1.5 text-xs"
              >
                <span className="font-mono">{p.a}</span>
                <span className="text-muted-foreground">×</span>
                <span className="font-mono">{p.b}</span>
                <div className="ml-auto flex w-32 items-center gap-2">
                  <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-primary"
                      style={{ width: `${Math.round(p.score * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 tabular-nums text-right text-muted-foreground">
                    {(p.score * 100).toFixed(0)}%
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
