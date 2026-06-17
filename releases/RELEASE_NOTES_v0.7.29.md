# v0.7.29 — chart cell UX hotfix

Two unrelated UX bugs surfaced from real use of the bundled-AI demo.

## 1. Chart source-cell picker showed just "SELECT"

The Visualization (Chart) cell's source dropdown labelled each SQL
cell with the first 60 characters of its SQL. Most analyst queries
begin with `SELECT * FROM ...` or `SELECT date_trunc(...)`, so when
the label truncated to fit the dropdown, every option just read
"SELECT" — no way to tell them apart.

Now every option carries the cell's position in the notebook and a
normalised SQL preview:

```
Cell #1 · SELECT * FROM orders WHERE created_at > '2024-...
Cell #2 · WITH revenue_cte AS (SELECT region, SUM(revenu...
Cell #4 · SELECT region, SUM(revenue) FROM weekly_orders...
```

Whitespace gets collapsed to single spaces before truncation so
multi-line CTEs surface the interesting part rather than just the
opening `WITH` or `SELECT`.

Placeholders also clarified:
- "No SQL cells yet — add one above"
- "Pick a SQL cell as the data source…"

## 2. Native `<select>` popup painted light-on-white in dark mode

A user reported X / Y axis dropdowns rendering with near-invisible
text on a light background when the rest of the app was in dark
mode. Reproducible on Windows / Linux Chrome, not on macOS Safari —
hence why it took a customer screenshot to surface.

Native `<select>` popups use the operating system's UA-rendered
option list unless the page explicitly opts into dark with
`color-scheme: dark`. Added that to the `.dark` scope for `select` /
`input` / `textarea`, plus explicit `option` + `optgroup` styling
for the small number of browsers that ignore `color-scheme` but do
honor direct option background colors.

## Upgrade

```bash
docker pull ghcr.io/sanniheruwala/rednotebook-ai:v0.7.29
```

HF Space: bump the `FROM` tag in the Space's Dockerfile from
`:v0.7.28` to `:v0.7.29`. Model layer cached from v0.7.28, so the
build is fast.
