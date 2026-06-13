"use client";

import type { EChartsType } from "echarts";
import type { ColumnInfo } from "@/lib/types";

const PIXEL_RATIO = 2;

// Headless re-renders happen at a fixed analyst-friendly export size
// so a 460px-tall chart on screen still produces a presentation-grade
// image (slide-ready, copy-pasteable into docs).
const EXPORT_WIDTH = 1280;
const EXPORT_HEIGHT = 720;

/* --------------------------- public API --------------------------- */

export async function downloadChartPng(
  instance: EChartsType,
  name: string,
): Promise<void> {
  const dataUrl = await getPngDataUrl(instance);
  triggerDownload(dataUrl, sanitizeFilename(name, "png"));
}

export async function downloadChartSvg(
  instance: EChartsType,
  name: string,
): Promise<void> {
  const svg = await getSvgString(instance);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, sanitizeFilename(name, "svg"));
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

/**
 * Returns true on success, false if the browser/environment refused
 * (insecure context, permission denied, ClipboardItem unsupported).
 * The caller should toast accordingly.
 */
export async function copyChartPngToClipboard(
  instance: EChartsType,
): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    !navigator.clipboard ||
    typeof window === "undefined" ||
    typeof window.ClipboardItem === "undefined"
  ) {
    return false;
  }
  try {
    const dataUrl = await getPngDataUrl(instance);
    const blob = await dataUrlToBlob(dataUrl);
    await navigator.clipboard.write([
      new window.ClipboardItem({ "image/png": blob }),
    ]);
    return true;
  } catch (err) {
    console.warn("clipboard copy failed", err);
    return false;
  }
}

export function downloadResultCsv(
  rows: Record<string, unknown>[],
  columns: ColumnInfo[],
  name: string,
): void {
  const header = columns.map((c) => csvEscape(c.name)).join(",");
  const body = rows
    .map((row) => columns.map((c) => csvEscape(row[c.name])).join(","))
    .join("\n");
  const csv = `${header}\n${body}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, sanitizeFilename(name, "csv"));
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
}

/* ------------------------ format conversion ----------------------- */

/**
 * Get a PNG data URL from the chart. ECharts' getDataURL only knows how
 * to emit a raster from the canvas renderer — if the live chart is in
 * SVG mode (we use SVG for <3k points), we briefly mount a hidden
 * canvas copy of the same option and grab the PNG from there.
 */
async function getPngDataUrl(instance: EChartsType): Promise<string> {
  try {
    const direct = instance.getDataURL({
      type: "png",
      pixelRatio: PIXEL_RATIO,
      backgroundColor: "transparent",
    });
    // ECharts in SVG mode returns a data: URL pointing at the SVG, not
    // an image/png. Detect that and fall through to headless render.
    if (direct.startsWith("data:image/png")) return direct;
  } catch {
    // fall through
  }

  const option = instance.getOption() as unknown;
  return renderHeadless(option, "canvas", (chart) =>
    chart.getDataURL({
      type: "png",
      pixelRatio: PIXEL_RATIO,
      backgroundColor: "transparent",
    }),
  );
}

async function getSvgString(instance: EChartsType): Promise<string> {
  // renderToSVGString exists only when the chart was initialised with
  // renderer: 'svg'. The signature isn't on EChartsType pre-5.5, so we
  // duck-type the call.
  const live = (instance as unknown as {
    renderToSVGString?: () => string;
  }).renderToSVGString;
  if (typeof live === "function") {
    const svg = live.call(instance);
    if (typeof svg === "string" && svg.length > 0) return svg;
  }
  const option = instance.getOption() as unknown;
  return renderHeadless(option, "svg", (chart) => {
    const fn = (chart as unknown as {
      renderToSVGString?: () => string;
    }).renderToSVGString;
    if (typeof fn !== "function") {
      throw new Error("ECharts SVG renderer unavailable");
    }
    return fn.call(chart);
  });
}

async function renderHeadless<T>(
  option: unknown,
  renderer: "canvas" | "svg",
  emit: (chart: EChartsType) => T,
): Promise<T> {
  const echarts = await import("echarts");
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.width = `${EXPORT_WIDTH}px`;
  host.style.height = `${EXPORT_HEIGHT}px`;
  host.style.pointerEvents = "none";
  document.body.appendChild(host);
  try {
    const chart = echarts.init(host, null, {
      renderer,
      width: EXPORT_WIDTH,
      height: EXPORT_HEIGHT,
    });
    chart.setOption(option as Parameters<EChartsType["setOption"]>[0]);
    const out = emit(chart);
    chart.dispose();
    return out;
  } finally {
    document.body.removeChild(host);
  }
}

/* ------------------------------ utils ----------------------------- */

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function sanitizeFilename(name: string, ext: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
  return `${base || "chart"}.${ext}`;
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl);
  return res.blob();
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "object") s = JSON.stringify(v);
  else s = String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
