# v0.7.22 — auto-recommended chart grid

The Chart tab no longer opens to a blank axis-picker. Instead, it
shows a 2×2 grid of live chart thumbnails the recommender thinks fit
your result — with a one-line "why this one" caption under each.

## How it picks

A pure-TypeScript heuristic engine — no LLM, no round trip — infers
each column's role (time / category-low / category-mid / numeric-int /
numeric-float / boolean / id / text) from the data sample, then
matches role combinations to the chart types that work for them:

- **Time + numeric** → line / area chart
- **Time + numeric + low-cardinality category** → stacked area
- **Low-cardinality category + numeric** → bar (top-ranked categories)
- **2-8 distinct categories + numeric** → donut for composition
- **Two numerics** → scatter (optionally coloured by a category)
- **Single numeric** → histogram for distribution
- **Single-row + single numeric** → KPI tile
- **Boolean + numeric** → true/false bar

Candidates are scored — a 60-point time-series beats a 50-point
histogram. The grid shows the top 4. A "Try another set" button
cycles through up to 8 ranked candidates.

## The grid UX

- Click a thumbnail → that chart becomes the cell's saved chart and the
  view switches to full-size.
- A 5th "Custom" tile in the grid opens the existing manual builder
  for the cases the heuristic missed.
- From the full-size view, "← Suggestions" returns to the grid;
  "Customize this chart" jumps into the manual builder with the
  current chart pre-loaded.

## Why not AI?

The chart recommender is deliberately deterministic. Same data → same
ranked chart suggestions every time — important for reproducibility
and instant feel (suggestions render in ~1ms, no spinner). An AI
suggestion path can layer on top in a future release as a "Get more
ideas" button.

## Implementation notes

- New `frontend/lib/chart-recommender.ts` — 280 LOC, pure-TS, no deps.
- `ChartView` grew a `compact` prop for thumbnail mode (no card
  chrome, no title, fills its container).
- `ResultTabs` got a `ChartTab` shell that tracks grid / full / custom
  view modes locally (not persisted).

## Upgrade notes

No new dependencies. Pure frontend addition.
