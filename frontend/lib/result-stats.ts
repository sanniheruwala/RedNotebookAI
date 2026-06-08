import type { ColumnInfo, QueryResultPayload } from "@/lib/types";

type ColumnStats =
  | {
      kind: "numeric";
      count: number;
      nulls: number;
      min: number;
      max: number;
      mean: number;
      sum: number;
    }
  | {
      kind: "categorical";
      count: number;
      nulls: number;
      distinct: number;
      top: Array<{ value: string; count: number; share: number }>;
    }
  | {
      kind: "temporal";
      count: number;
      nulls: number;
      min: string;
      max: string;
    };

export type AggregatedStats = Record<string, ColumnStats>;

function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function isTemporalColumn(col: ColumnInfo): boolean {
  const t = (col.data_type || "").toLowerCase();
  return (
    t.includes("date") || t.includes("time") || t.includes("timestamp")
  );
}

function isNumericColumn(col: ColumnInfo): boolean {
  const t = (col.data_type || "").toLowerCase();
  return (
    t.includes("int") ||
    t.includes("float") ||
    t.includes("double") ||
    t.includes("decimal") ||
    t.includes("numeric") ||
    t.includes("real") ||
    t.includes("number")
  );
}

/**
 * Compute lightweight, JSON-safe column stats on the client so the AI
 * summarizer has actual numbers to cite. Cheap (single pass) and never
 * blocks rendering — caller decides when to invoke.
 */
export function computeAggregatedStats(
  result: QueryResultPayload,
): AggregatedStats {
  const stats: AggregatedStats = {};
  const rows = result.rows;
  const sampleCap = Math.min(rows.length, 2000);

  for (const col of result.columns) {
    let count = 0;
    let nulls = 0;
    const numericValues: number[] = [];
    const freq = new Map<string, number>();
    let temporalMin: string | null = null;
    let temporalMax: string | null = null;

    const treatNumeric = isNumericColumn(col);
    const treatTemporal = isTemporalColumn(col);

    for (let i = 0; i < sampleCap; i++) {
      const v = rows[i][col.name];
      if (v === null || v === undefined || v === "") {
        nulls++;
        continue;
      }
      count++;

      if (treatNumeric) {
        const n = parseNumber(v);
        if (n !== null) numericValues.push(n);
      } else if (treatTemporal) {
        const s = String(v);
        if (!temporalMin || s < temporalMin) temporalMin = s;
        if (!temporalMax || s > temporalMax) temporalMax = s;
      } else {
        const s = String(v);
        freq.set(s, (freq.get(s) ?? 0) + 1);
      }
    }

    if (treatNumeric && numericValues.length > 0) {
      let sum = 0;
      let min = numericValues[0];
      let max = numericValues[0];
      for (const n of numericValues) {
        sum += n;
        if (n < min) min = n;
        if (n > max) max = n;
      }
      stats[col.name] = {
        kind: "numeric",
        count: numericValues.length,
        nulls,
        min,
        max,
        mean: sum / numericValues.length,
        sum,
      };
    } else if (treatTemporal && temporalMin && temporalMax) {
      stats[col.name] = {
        kind: "temporal",
        count,
        nulls,
        min: temporalMin,
        max: temporalMax,
      };
    } else if (freq.size > 0) {
      const total = Array.from(freq.values()).reduce((a, b) => a + b, 0);
      const top = Array.from(freq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([value, c]) => ({
          value: value.length > 80 ? value.slice(0, 80) + "…" : value,
          count: c,
          share: total ? c / total : 0,
        }));
      stats[col.name] = {
        kind: "categorical",
        count,
        nulls,
        distinct: freq.size,
        top,
      };
    }
  }

  return stats;
}
