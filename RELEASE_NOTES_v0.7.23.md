# v0.7.23 — the Chart tab grew up

This release replaces the empty axis-picker that used to greet every
result with a complete report-grade chart card. It rolls in two
feature sets — the auto-recommended chart grid (PR #19) and the
Share + Customize + inline editing surface (PR #20) — because the
v0.7.22 version was transient and never tagged.

## The new Chart tab, in one screen

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. You land on a 2×2 grid of suggested charts (no clicks needed)│
│ 2. Pick one → it expands to full-size with report chrome        │
│ 3. Rename in place, tweak palette / format / layout in Customize│
│ 4. Share → download PNG / SVG / clipboard / CSV                 │
└─────────────────────────────────────────────────────────────────┘
```

## Auto-recommended chart grid

A pure-TypeScript heuristic engine reads your result and ranks chart
candidates by shape:

| Roles | Chart |
|-------|-------|
| time + numeric | line / area |
| time + numeric + low-card category | stacked area |
| low-card category + numeric | bar (top categories) |
| 2-8 distinct categories + numeric | donut for composition |
| two numerics | scatter (coloured by a category if present) |
| single numeric | histogram |
| single-row + single numeric | KPI |
| boolean + numeric | true/false bar |

Each tile shows a live ECharts thumbnail with a one-line "why this
one" caption. **"Try another set"** cycles through up to 8 ranked
candidates. **"Custom"** opens the manual axis picker for the cases
the heuristic missed.

Deterministic — same data, same suggestions. ~1ms to compute, no LLM,
no round trip.

## Report-grade chart chrome

Every full-size chart now has:

- 1px gradient accent strip across the top in the active palette.
- HTML header above the canvas with an **auto-generated title**
  (`{Y} by {X}`, `{Y} over time`, `Distribution of {Y}`, etc.), a
  one-line description ("Sum of revenue · grouped by region"), and a
  row-count badge.
- HTML footer with the aggregation method, optional "truncated"
  warning, query duration in ms/s, and a quiet "Made with
  RedNotebook" mark.
- The internal ECharts title is removed so typography (tabular nums,
  kerning, weights) stays consistent with the rest of the app.

## Share menu

Every chart has a Share button that opens a dropdown with four export
paths:

- **Download as PNG** — high-res raster (pixel ratio 2, 1280×720
  export size regardless of on-screen size), paste anywhere.
- **Download as SVG** — vector, scales without blur.
- **Copy image to clipboard** — straight into Slack / Docs / email.
- **Download data as CSV** — the numbers behind the chart, header
  row matches the result columns, CSV-escaped values for commas /
  quotes / newlines / dates.

Cross-renderer fallback: ECharts emits only the format that matches
its active renderer (canvas → PNG, SVG mode → SVG). The export utility
detects this and briefly mounts a hidden 1280×720 echarts instance in
the desired renderer to grab the right format. User never sees the
second render.

## Customize popover

A new Customize button next to Share opens a popover with five
sections that all persist into `config.options`:

- **Title & description** — free-text override of the auto-generated.
- **Look** — 5 palette presets (Brand / Ocean / Forest / Sunset /
  Mono) with swatch previews + 3 heights (Compact / Standard / Tall).
- **Numbers** — Y-axis format: Auto / Number / `$` / `%`.
- **Show** — toggles for legend / gridlines / data labels (bar) /
  smooth lines (line/area) / area fill (line). Chart-type-specific
  toggles hide themselves when irrelevant.

## Inline title and subtitle editing

Click the title or subtitle in the header → it becomes an inline
input, autofocused and text-selected. Enter or blur commits; Escape
reverts. Most users want to rename, not open a dialog.

Read-only consumers (visualization-cell, published HTML) pass no
`onChange` and the field stays display-only.

## Stable option memo

Title/subtitle changes used to trigger an ECharts canvas redraw +
re-animation per keystroke. The `useMemo` deps are now the structural
fields only (`chart_type`, `x`, `y`, `color`, `aggregation`,
`options`, `filters`) — HTML header changes no longer disturb the
canvas. Typing feels instant.

## Notes

- The v0.7.22 version was transient and never tagged; this release
  covers everything that would have shipped under it.
- No new Python dependencies. One new frontend file
  (`frontend/lib/chart-export.ts`) and one new UI primitive wrapper
  (`frontend/components/ui/popover.tsx` over the already-installed
  Radix Popover).

## Upgrade

```bash
docker pull ghcr.io/sanniheruwala/rednotebook-ai:v0.7.23
```

HF Space refresh: bump the `FROM` tag in the Space's Dockerfile from
`v0.7.21` to `v0.7.23`.
