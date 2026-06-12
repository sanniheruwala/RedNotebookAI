"""Headless-Chromium demo recorder.

Drives a fresh browser through the v0.7.15 wow-moment sequence:

  1. App loads
  2. Demo notebook opens from the left sidebar
  3. SQL cell runs (DuckDB :memory:, no external deps)
  4. Result table renders
  5. Profile tab opens — sparkline histograms appear
  6. Back to Table
  7. Summarize result fires the mock AI provider
  8. Markdown summary fades in
  9. Beat on the finished summary

The recording writes a WebM into ``demo/_video/``. A separate ffmpeg+gifski
pass converts to the final 1280-wide 15 fps GIF.

Playwright's video does not record the OS cursor, so we inject a synthetic
cursor element via init script. It follows ``mousemove`` events and gets
a click-pulse animation on ``mousedown``.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
VIDEO_DIR = ROOT / "demo" / "_video"
VIDEO_DIR.mkdir(parents=True, exist_ok=True)

# A small synthetic-cursor overlay so the GIF actually shows where the
# action is. Without this the UI just "responds to invisible input" which
# reads as glitchy, not magic.
CURSOR_INIT_SCRIPT = """
(() => {
  const c = document.createElement('div');
  c.id = '__rec_cursor';
  c.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 22px; height: 22px;
    pointer-events: none; z-index: 2147483647;
    transform: translate(-3px, -3px);
    transition: transform 60ms linear;
  `;
  c.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22">
      <path d="M3 2 L3 18 L7 14 L10 21 L13 20 L10 13 L17 13 Z"
            fill="#fff" stroke="#000" stroke-width="1.2" stroke-linejoin="round"/>
    </svg>
  `;
  const pulse = document.createElement('div');
  pulse.id = '__rec_pulse';
  pulse.style.cssText = `
    position: fixed; top: 0; left: 0;
    width: 28px; height: 28px; border-radius: 999px;
    pointer-events: none; z-index: 2147483646;
    border: 2px solid rgba(34, 197, 94, 0.85);
    transform: translate(-14px, -14px) scale(0.4);
    opacity: 0;
    transition: transform 240ms ease-out, opacity 320ms ease-out;
  `;
  function ready(fn) {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }
  ready(() => {
    document.body.appendChild(c);
    document.body.appendChild(pulse);
  });
  window.addEventListener('mousemove', (e) => {
    c.style.transform = `translate(${e.clientX - 3}px, ${e.clientY - 3}px)`;
  }, true);
  window.addEventListener('mousedown', (e) => {
    pulse.style.transform = `translate(${e.clientX - 14}px, ${e.clientY - 14}px) scale(0.4)`;
    pulse.style.opacity = '1';
    requestAnimationFrame(() => requestAnimationFrame(() => {
      pulse.style.transform = `translate(${e.clientX - 14}px, ${e.clientY - 14}px) scale(1.7)`;
      pulse.style.opacity = '0';
    }));
  }, true);
})();
"""


def smooth_move(page, x: float, y: float, steps: int = 18) -> None:
    """Mouse moves with steps so the cursor doesn't teleport."""
    page.mouse.move(x, y, steps=steps)


def smooth_click(page, locator) -> tuple[float, float]:
    """Move the synthetic cursor to a locator's centre then click."""
    locator = locator.first
    locator.wait_for(state="visible", timeout=10_000)
    box = locator.bounding_box()
    if box is None:
        raise RuntimeError("no bounding box for locator")
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    smooth_move(page, cx, cy)
    page.wait_for_timeout(120)  # gives the cursor overlay a beat to land
    page.mouse.down()
    page.mouse.up()
    return cx, cy


def run() -> Path:
    demo_notebook = json.loads(
        (ROOT / "demo" / "q3-weekly-orders-by-region.json").read_text()
    )
    demo_title = demo_notebook["metadata"]["title"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            device_scale_factor=2,
            record_video_dir=str(VIDEO_DIR),
            record_video_size={"width": 1280, "height": 800},
            color_scheme="dark",
        )
        context.add_init_script(CURSOR_INIT_SCRIPT)
        page = context.new_page()

        page.goto("http://localhost:3000/", wait_until="networkidle", timeout=30_000)

        # Park the cursor off-frame while the notebooks list resolves so
        # the cursor doesn't sit on a random pixel waiting to land.
        smooth_move(page, 1, 1, steps=1)
        page.wait_for_timeout(700)

        # Beat 1 — open the demo notebook from the left sidebar. Target the
        # actual <button> that wraps the title <span>, not "any element
        # containing the title" — that earlier matched the html root.
        notebook_btn = page.locator(
            f"button:has(span.truncate.font-medium:text-is('{demo_title}'))"
        )
        notebook_btn.wait_for(state="visible", timeout=15_000)
        smooth_click(page, notebook_btn)
        page.wait_for_timeout(900)

        # Beat 2 — run the SQL cell. Use exact match on "Run" so we don't
        # accidentally hit the topbar "Run all" button.
        page.screenshot(path=str(VIDEO_DIR / "dbg_before_run.png"))
        run_btn = page.get_by_role("button", name="Run", exact=True)
        smooth_click(page, run_btn)
        # Result-tabs only render when there's a result, so the Profile
        # tab existing is a reliable "results are in" signal.
        page.get_by_role("tab", name="Profile").wait_for(
            state="visible", timeout=15_000
        )
        page.screenshot(path=str(VIDEO_DIR / "dbg_after_run.png"))
        page.wait_for_timeout(600)

        # Beat 3 — Profile tab. shadcn Tabs renders TabsTrigger as
        # role="tab"; the result tabs are inside the SQL cell so this
        # selector is unambiguous.
        smooth_click(page, page.get_by_role("tab", name="Profile"))
        # Wait for histograms to render (Sparkline SVGs are aria-labelled).
        try:
            page.locator("svg[aria-label='Value distribution']").first.wait_for(
                state="visible", timeout=5_000
            )
        except Exception:
            page.screenshot(path=str(VIDEO_DIR / "dbg_no_histograms.png"))
            raise
        page.screenshot(path=str(VIDEO_DIR / "dbg_profile.png"))
        page.wait_for_timeout(1100)

        # Beat 4 — back to the Table to reset the eye for the summary.
        smooth_click(page, page.get_by_role("tab", name="Table"))
        page.wait_for_timeout(500)

        # Beat 5 — Summarize result. Mock provider returns within ~200 ms.
        smooth_click(
            page,
            page.get_by_role("button", name="Summarize result", exact=True),
        )
        # Wait for the summary panel — the Dismiss button only exists when
        # the inline summary panel is mounted, and the aria-label is
        # unique on the page.
        page.get_by_role("button", name="Dismiss summary").wait_for(
            state="visible", timeout=8_000
        )
        page.screenshot(path=str(VIDEO_DIR / "dbg_summary.png"))
        page.wait_for_timeout(1800)

        # Beat 6 — final beat off-frame so the loop point is clean.
        smooth_move(page, 1, 1, steps=20)
        page.wait_for_timeout(700)

        context.close()
        browser.close()

    # Playwright writes the video on context close, named with the page id.
    webm_paths = sorted(VIDEO_DIR.glob("*.webm"), key=lambda p_: p_.stat().st_mtime)
    if not webm_paths:
        raise RuntimeError("playwright did not produce a webm")
    webm = webm_paths[-1]
    print(f"recorded {webm} ({webm.stat().st_size / 1024:.0f} KB)")
    return webm


if __name__ == "__main__":
    started = time.time()
    out = run()
    print(f"done in {time.time() - started:.1f}s — {out}")
