# v0.7.24 — chart hotfix

Two regressions in v0.7.23 that real use surfaced within hours of
shipping.

## Downloaded PNG was blank

The live ECharts in the full-size chart card runs in SVG renderer
mode for results under 3k points (the common analyst-shaped result).
In SVG mode, ECharts' `getDataURL({type:'png'})` doesn't reliably
emit a real raster — depending on browser and chart shape it returns
either a mis-typed SVG-data-URL or a partly-rendered transparent
PNG. The "startsWith data:image/png" defensive check would sometimes
pass anyway, sending the malformed URL straight to the file system.

Now: **PNG export always goes through a headless canvas re-render**,
regardless of the live renderer. Plus four quality fixes:

- **Animation disabled** in the headless option so we don't capture
  the chart mid-grow (the second-most-common blank-export mode).
- **One `requestAnimationFrame` wait** after `setOption` so the
  renderer has produced its final pixels before we read them.
- **White background** instead of transparent — Slack / Docs /
  Notion render behind a light surface anyway, and transparent
  PNGs were being mis-perceived as empty in some viewers.
- **DataZoom stripped** from the still image so the pan slider
  doesn't pollute the exported chart.

Cost: ~150ms extra per PNG export. Worth it for always-correct
downloads.

## Customize popover extended beyond the viewport with no scroll

`max-h-[70vh]` was meaningless on short windows — Radix sizes the
popover to its natural content height first, and 70vh wasn't tall
enough on screens under ~700px.

Now the popover is a **flex column** with:

- **`max-h-[var(--radix-popover-content-available-height)]`** —
  Radix's collision detector populates this CSS variable with the
  actual largest height that fits without going off-screen. Tighter
  than `70vh` and dynamic.
- **Pinned header** (`shrink-0`) — the title and Reset stay visible
  while you scroll.
- **Inner scrollable body** (`overflow-y-auto overscroll-contain`).
- **`max-w-[calc(100vw-24px)]`** so the popover doesn't overflow
  the screen on tiny phones.
- **`collisionPadding={12}`** so it keeps breathing room from
  screen edges.

## Upgrade

```bash
docker pull ghcr.io/sanniheruwala/rednotebook-ai:v0.7.24
```

HF Space refresh: bump the `FROM` tag in the Space's Dockerfile to
`:v0.7.24`.
