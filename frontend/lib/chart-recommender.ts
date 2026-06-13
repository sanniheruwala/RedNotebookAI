/**
 * Client-side chart recommender.
 *
 * Given a QueryResultPayload, returns a ranked list of candidate
 * ChartConfigs the result lends itself to — with a one-line "why" so
 * the UI can explain what each chart is showing.
 *
 * The recommender is pure heuristics: no LLM, no network, runs in ~1ms
 * on a 1k-row sample. Driven by inferring each column's role (time /
 * categorical-low / categorical-high / numeric-int / numeric-float /
 * boolean / id) from a sample of values, then matching role
 * combinations to the chart types that work for them.
 *
 * Ordering is opinionated. A time-series with > 10 points outranks a
 * 4-category bar chart. A scatter with a strong-looking correlation
 * outranks a histogram. Charts that need columns the result doesn't
 * have aren't generated.
 */

import type { ChartConfig, ColumnInfo, QueryResultPayload } from "@/lib/types";

// ---------------------------------------------------------------------------
// Column role inference
// ---------------------------------------------------------------------------
export type ColumnRole =
  | "time"
  | "category-low"   // 2-10 distinct values
  | "category-mid"   // 11-50 distinct values
  | "category-high"  // > 50 distinct values
  | "numeric-int"
  | "numeric-float"
  | "boolean"
  | "id"             // looks like a primary key / uuid
  | "text"           // long strings, not categorical
  | "unknown";

export type RoledColumn = {
  name: string;
  dataType: string;
  role: ColumnRole;
  distinct: number;
  nullRatio: number;
  numericRatio: number;
  /** Min / max for numeric columns, useful for axis hints. */
  min?: number;
  max?: number;
};

const TIME_NAME_HINTS = [
  "date",
  "time",
  "timestamp",
  "datetime",
  "created",
  "updated",
  "occurred",
  "week",
  "month",
  "year",
  "day",
  "hour",
  "_at",
];

const TIME_TYPE_HINTS = [
  "date",
  "time",
  "timestamp",
  "datetime",
];

function looksLikeTime(name: string, dataType: string, samples: unknown[]): boolean {
  const lowerName = name.toLowerCase();
  const lowerType = dataType.toLowerCase();
  if (TIME_TYPE_HINTS.some((h) => lowerType.includes(h))) return true;
  if (TIME_NAME_HINTS.some((h) => lowerName.includes(h))) {
    // Verify at least one sample parses as a date-ish thing.
    return samples.some((s) => {
      if (s == null) return false;
      const str = String(s);
      if (str.length < 6) return false;
      return !Number.isNaN(Date.parse(str));
    });
  }
  // Fallback: a high fraction of values parse as Date AND look date-ish in shape.
  let parsed = 0;
  let valid = 0;
  for (const s of samples) {
    if (s == null) continue;
    valid++;
    const str = String(s);
    if (str.length >= 8 && !Number.isNaN(Date.parse(str))) parsed++;
  }
  return valid > 0 && parsed / valid >= 0.85;
}

function looksLikeId(name: string, distinct: number, sampleCount: number): boolean {
  const lower = name.toLowerCase();
  if (distinct === sampleCount && sampleCount > 5) {
    // Every value is unique → almost certainly an id-ish column.
    if (lower.endsWith("_id") || lower === "id" || lower.includes("uuid") || lower.includes("guid")) {
      return true;
    }
    // Even without an id-y name, all-distinct + > 5 rows is a strong signal.
    return true;
  }
  return false;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function inferRole(col: ColumnInfo, rows: Record<string, unknown>[]): RoledColumn {
  const name = col.name;
  const dataType = col.data_type ?? "";
  const samples = rows.map((r) => r[name]);
  const valid = samples.filter((s) => s !== null && s !== undefined);
  const nullRatio = samples.length === 0 ? 0 : (samples.length - valid.length) / samples.length;

  // Distinct count — string-coerce so dates / numbers / booleans compare fairly.
  const distinct = new Set(valid.map((v) => (typeof v === "object" && v ? JSON.stringify(v) : String(v)))).size;

  // Numeric-ness — true booleans are not counted as numeric.
  const numericValid = valid.filter((v) => typeof v !== "boolean" && isFiniteNumber(Number(v)));
  const numericRatio = valid.length === 0 ? 0 : numericValid.length / valid.length;

  let min: number | undefined;
  let max: number | undefined;
  if (numericValid.length) {
    const nums = numericValid.map((v) => Number(v));
    min = Math.min(...nums);
    max = Math.max(...nums);
  }

  let role: ColumnRole = "unknown";

  if (valid.every((v) => typeof v === "boolean")) {
    role = "boolean";
  } else if (looksLikeTime(name, dataType, samples)) {
    role = "time";
  } else if (looksLikeId(name, distinct, valid.length)) {
    role = "id";
  } else if (numericRatio >= 0.85 && numericValid.length > 0) {
    // Treat as numeric. Integer-ness: every numeric sample is whole.
    const allInt = numericValid.every((v) => Number.isInteger(Number(v)));
    role = allInt ? "numeric-int" : "numeric-float";
  } else if (distinct <= 10) {
    role = "category-low";
  } else if (distinct <= 50) {
    role = "category-mid";
  } else {
    // Distinct fraction tells us text vs high-cardinality category.
    const fraction = valid.length === 0 ? 0 : distinct / valid.length;
    role = fraction > 0.7 ? "text" : "category-high";
  }

  return { name, dataType, role, distinct, nullRatio, numericRatio, min, max };
}

// ---------------------------------------------------------------------------
// Candidate chart synthesis
// ---------------------------------------------------------------------------
export type ChartRecommendation = {
  config: ChartConfig;
  /** Short label like "Revenue by region · bar". Shown under the thumbnail. */
  label: string;
  /** One-sentence reason. Hover/expanded view shows this. */
  why: string;
  /** Internal ranking score — higher = more prominent in the grid. */
  score: number;
};

export function recommendCharts(result: QueryResultPayload, max = 8): ChartRecommendation[] {
  const rows = result.rows ?? [];
  const columns = result.columns ?? [];
  if (rows.length === 0 || columns.length === 0) return [];

  const sample = rows.slice(0, 200);
  const roled = columns.map((c) => inferRole(c, sample));

  const time = roled.find((r) => r.role === "time");
  const lowCats = roled.filter((r) => r.role === "category-low");
  const midCats = roled.filter((r) => r.role === "category-mid");
  const numerics = roled.filter((r) => r.role === "numeric-int" || r.role === "numeric-float");
  const booleans = roled.filter((r) => r.role === "boolean");

  const candidates: ChartRecommendation[] = [];

  // ── Time-series shapes ──────────────────────────────────────────────────
  if (time && numerics.length >= 1) {
    candidates.push({
      config: {
        chart_type: "time_series",
        x: time.name,
        y: numerics[0].name,
        aggregation: "sum",
        title: `${prettyMetric(numerics[0].name)} over time`,
      },
      label: `${prettyMetric(numerics[0].name)} over time`,
      why: `${numerics[0].name} plotted against ${time.name} — best fit when you want to spot trends.`,
      score: 100 + Math.min(20, rows.length / 5),
    });

    // Stacked area when there's also a low-cardinality category to split by.
    if (lowCats.length >= 1) {
      candidates.push({
        config: {
          chart_type: "area",
          x: time.name,
          y: numerics[0].name,
          color: lowCats[0].name,
          aggregation: "sum",
          title: `${prettyMetric(numerics[0].name)} over time by ${lowCats[0].name}`,
        },
        label: `${prettyMetric(numerics[0].name)} by ${lowCats[0].name}, over time`,
        why: `Splits the trend by ${lowCats[0].name} (${lowCats[0].distinct} categories) — useful for share-of-total over time.`,
        score: 92,
      });
    }

    // A second numeric over time deserves its own line chart too.
    if (numerics.length >= 2) {
      candidates.push({
        config: {
          chart_type: "line",
          x: time.name,
          y: numerics[1].name,
          aggregation: "avg",
          title: `${prettyMetric(numerics[1].name)} over time`,
        },
        label: `${prettyMetric(numerics[1].name)} over time`,
        why: `Average ${numerics[1].name} per ${time.name} — second numeric column.`,
        score: 70,
      });
    }
  }

  // ── Category × numeric (bar) ────────────────────────────────────────────
  if (lowCats.length >= 1 && numerics.length >= 1) {
    const cat = lowCats[0];
    const num = numerics[0];
    candidates.push({
      config: {
        chart_type: "bar",
        x: cat.name,
        y: num.name,
        aggregation: "sum",
        title: `${prettyMetric(num.name)} by ${cat.name}`,
      },
      label: `${prettyMetric(num.name)} by ${cat.name}`,
      why: `Sum of ${num.name} grouped by ${cat.name} (${cat.distinct} categories) — ranks the categories.`,
      score: 95,
    });

    // Donut works when the category is tiny.
    if (cat.distinct >= 2 && cat.distinct <= 8) {
      candidates.push({
        config: {
          chart_type: "donut",
          x: cat.name,
          y: num.name,
          aggregation: "sum",
          title: `Share of ${prettyMetric(num.name)} by ${cat.name}`,
        },
        label: `Share by ${cat.name}`,
        why: `${cat.distinct} categories — shows composition as a share of total ${num.name}.`,
        score: 80,
      });
    }
  }

  // Mid-cardinality category gets a top-N bar instead.
  if (midCats.length >= 1 && numerics.length >= 1 && lowCats.length === 0) {
    const cat = midCats[0];
    const num = numerics[0];
    candidates.push({
      config: {
        chart_type: "bar",
        x: cat.name,
        y: num.name,
        aggregation: "sum",
        title: `${prettyMetric(num.name)} by ${cat.name} (top entries)`,
      },
      label: `${prettyMetric(num.name)} by ${cat.name}`,
      why: `${cat.distinct} distinct ${cat.name} values — the chart shows the highest-scoring ones.`,
      score: 85,
    });
  }

  // ── Two-numeric → scatter ───────────────────────────────────────────────
  if (numerics.length >= 2 && !time) {
    candidates.push({
      config: {
        chart_type: "scatter",
        x: numerics[0].name,
        y: numerics[1].name,
        title: `${numerics[0].name} vs ${numerics[1].name}`,
        ...(lowCats.length >= 1 ? { color: lowCats[0].name } : {}),
      },
      label: `${numerics[0].name} vs ${numerics[1].name}`,
      why: `Two numeric columns — scatter is the fastest way to spot a correlation${lowCats.length ? `, coloured by ${lowCats[0].name}` : ""}.`,
      score: 78,
    });
  }

  // ── Single numeric → histogram ──────────────────────────────────────────
  if (numerics.length >= 1) {
    const num = numerics[0];
    if (num.distinct > 8) {
      candidates.push({
        config: {
          chart_type: "histogram",
          x: num.name,
          y: num.name,
          aggregation: "count",
          title: `Distribution of ${num.name}`,
        },
        label: `Distribution of ${num.name}`,
        why: `Bucketed counts of ${num.name} — shows shape, skew, and outliers.`,
        score: 60,
      });
    }
  }

  // ── Boolean breakdown ───────────────────────────────────────────────────
  if (booleans.length >= 1 && numerics.length >= 1) {
    candidates.push({
      config: {
        chart_type: "bar",
        x: booleans[0].name,
        y: numerics[0].name,
        aggregation: "sum",
        title: `${prettyMetric(numerics[0].name)} by ${booleans[0].name}`,
      },
      label: `${prettyMetric(numerics[0].name)} by ${booleans[0].name}`,
      why: `True/false split of ${numerics[0].name} — sanity check for a yes/no field.`,
      score: 55,
    });
  }

  // ── Pure category counts (no numerics) ──────────────────────────────────
  if (numerics.length === 0 && (lowCats.length >= 1 || midCats.length >= 1)) {
    const cat = lowCats[0] ?? midCats[0];
    candidates.push({
      config: {
        chart_type: "bar",
        x: cat.name,
        y: cat.name,
        aggregation: "count",
        title: `Rows by ${cat.name}`,
      },
      label: `Rows by ${cat.name}`,
      why: `Count of rows per ${cat.name} — fastest way to see distribution.`,
      score: 50,
    });
  }

  // ── KPI for very-small results ──────────────────────────────────────────
  if (rows.length === 1 && numerics.length === 1) {
    candidates.push({
      config: {
        chart_type: "kpi",
        x: null,
        y: numerics[0].name,
        title: prettyMetric(numerics[0].name),
      },
      label: `${prettyMetric(numerics[0].name)} (single value)`,
      why: `Single-row result with one number — best shown as a KPI tile, not a chart.`,
      score: 90,
    });
  }

  // ── Dedupe + rank ───────────────────────────────────────────────────────
  const seen = new Set<string>();
  const out: ChartRecommendation[] = [];
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    const key = `${c.config.chart_type}|${c.config.x}|${
      Array.isArray(c.config.y) ? c.config.y.join(",") : c.config.y
    }|${c.config.color ?? ""}|${c.config.aggregation ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** Pretty-print a column name as a title. snake_case → "Snake case". */
function prettyMetric(name: string): string {
  if (!name) return "value";
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
