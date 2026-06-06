// Capture README banner screenshots for both themes against a running
// dev server (http://localhost:3000). Run via:
//   node frontend/scripts/capture-screenshots.mjs
// Requires playwright to be installed at the workspace level.

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../../docs/images");
await mkdir(outDir, { recursive: true });

const BASE = process.env.SCREENSHOT_URL || "http://localhost:3000";
const VIEWPORT = { width: 1600, height: 1000 };

async function captureTheme(theme) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: theme,
  });
  const page = await ctx.newPage();

  // Seed next-themes' localStorage so the app boots straight into the
  // requested theme on first paint (avoids a dark-flash on light shots).
  await ctx.addInitScript((t) => {
    try {
      window.localStorage.setItem("theme", t);
    } catch {
      /* private browsing — ignored */
    }
  }, theme);

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  // Give the canvas time to settle (fonts, query client warmup, motion).
  await page.waitForTimeout(1500);

  const outPath = resolve(outDir, `screenshot-${theme}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`wrote ${outPath}`);

  await ctx.close();
  await browser.close();
}

await captureTheme("light");
await captureTheme("dark");
