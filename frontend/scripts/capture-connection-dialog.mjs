// Capture the connection-picker dialog open against a running dev
// server (http://localhost:3000). Companion to capture-screenshots.mjs.
//   node frontend/scripts/capture-connection-dialog.mjs

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

  await ctx.addInitScript((t) => {
    try {
      for (const k of Object.keys(window.localStorage)) {
        if (k.startsWith("rednotebook-")) window.localStorage.removeItem(k);
      }
      window.localStorage.setItem("theme", t);
    } catch {}
  }, theme);

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1500);

  // Open the connection-picker dropdown.
  await page.getByRole("button", { name: /Pick connection|DuckDB|in-memory|local/i }).first().click();
  await page.waitForTimeout(300);
  // Click "Manage connections…"
  await page.getByText(/Manage connections/i).click();
  // Wait long enough for the saved-connections query + the migration to settle.
  await page.waitForTimeout(2500);

  const outPath = resolve(outDir, `connections-${theme}.png`);
  await page.screenshot({ path: outPath, fullPage: false });
  console.log(`wrote ${outPath}`);

  await ctx.close();
  await browser.close();
}

await captureTheme("light");
await captureTheme("dark");
