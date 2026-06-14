# v0.7.19

UX polish across the two surfaces users hit most: the metadata tree
and the chart pane.

## Highlights

### 📁 Uploaded files now visible as a virtual `files` catalog

Drop a CSV / Parquet / JSON → the metadata tree now shows it in a
dedicated `files` node above the real DuckDB catalogs. Mono-font
table name + the original filename as a hover hint, so you know
what's yours. Click → drops a `SELECT * FROM <table> LIMIT 100`
into a fresh SQL cell.

Renders only on DuckDB connections + only when uploads exist. Faint
primary tint so it reads as "this is your stuff" instead of blending
into the schema explorer.

### 📊 HD chart renderer

Every chart now renders **SVG-crisp** at any device pixel ratio and
zoom level. Canvas fallback (with `devicePixelRatio = max(2,
window.devicePixelRatio)`) only kicks in for series > 3000 points
where SVG's per-element cost would matter.

Plus visual polish across every chart type:

- Default height 380 → 460
- Container: rounded-2xl + theme-aware ring + soft shadow for depth
- Title 14 → 16px with tighter letter-spacing
- Axis labels 11 → 12px, weight 500
- Tooltip backdrop blur 12 → 18 + saturation
- Bar width 36 → 48 + drop shadow per bar
- Line stroke 2.5 → 3px with round caps/joins
- Scatter symbols 10 → 14px + hover glow
- Pie/donut: radius bumps, 3px borders, donut centre 14 → 18 / weight 600

## Upgrade notes

No new dependencies. Pure frontend refresh.

## Full changelog

See the auto-generated commit log at the bottom of this release.
