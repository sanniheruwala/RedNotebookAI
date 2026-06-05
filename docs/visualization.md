# Visualization

## Chart types

Supported types (`rednotebook.visualization.recommender.SUPPORTED_CHART_TYPES`):

`line`, `bar`, `stacked_bar`, `area`, `scatter`, `pie`, `donut`, `heatmap`,
`histogram`, `box`, `time_series`, `kpi`, `table`.

## Recommendation logic

`recommend_chart(schema, sample)` picks a chart from column types:

| Inputs | Chart |
|--------|-------|
| 1 numeric column | KPI |
| Temporal + numeric | Time series |
| Categorical + numeric | Bar |
| 2 numeric | Scatter |
| Only categorical | Pie |
| Otherwise | Table |

## Frontend rendering

The frontend uses **Apache ECharts** for interactive charts and falls back to
a flat **Plotly** figure for HTML export. Chart configs are stored in the
notebook JSON alongside the SQL cell that produced them.

## Export options

| Format | Status |
|--------|--------|
| HTML (Plotly figure) | ✅ |
| PNG | Requires `kaleido` |
| SVG | Plotly export |
| PDF | Planned (Phase 2) |

Use the visualization tab in the result panel, or call
`rednotebook.visualization.export.export_html`.

## Performance warnings

The chart builder warns when row count exceeds
`DEFAULT_CHART_WARNING_THRESHOLD` (10,000 by default).
