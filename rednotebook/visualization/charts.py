"""Build chart payloads.

The Python side returns *specifications* (chart config + data table). The
frontend renders them with ECharts / Plotly. We also expose a Plotly fallback
for HTML / image export.
"""

from __future__ import annotations

from typing import Any

from rednotebook.connectors.base import QueryResult
from rednotebook.notebook.models import ChartConfig


def build_chart_spec(result: QueryResult, config: ChartConfig) -> dict[str, Any]:
    """Return a JSON-serializable chart spec for the frontend."""
    cols = [c.name for c in result.columns]
    return {
        "chart_type": config.chart_type,
        "x": config.x,
        "y": config.y,
        "color": config.color,
        "aggregation": config.aggregation,
        "title": config.title,
        "subtitle": config.subtitle,
        "theme": config.theme,
        "options": config.options,
        "columns": cols,
        "data": result.rows,
        "row_count": result.row_count,
        "truncated": result.truncated,
    }


def build_plotly_figure(result: QueryResult, config: ChartConfig):  # type: ignore[no-untyped-def]
    """Build a Plotly figure for export. Imported lazily."""
    import plotly.express as px  # noqa: WPS433

    df = result.to_dataframe()
    chart_type = config.chart_type
    common = {"title": config.title, "template": config.theme}
    if chart_type in {"line", "time_series"}:
        return px.line(df, x=config.x, y=config.y, color=config.color, **common)
    if chart_type == "area":
        return px.area(df, x=config.x, y=config.y, color=config.color, **common)
    if chart_type == "bar":
        return px.bar(df, x=config.x, y=config.y, color=config.color, **common)
    if chart_type == "stacked_bar":
        return px.bar(
            df, x=config.x, y=config.y, color=config.color, barmode="stack", **common
        )
    if chart_type == "scatter":
        return px.scatter(df, x=config.x, y=config.y, color=config.color, **common)
    if chart_type == "pie":
        return px.pie(df, names=config.x, values=config.y, **common)
    if chart_type == "donut":
        return px.pie(df, names=config.x, values=config.y, hole=0.5, **common)
    if chart_type == "histogram":
        return px.histogram(df, x=config.x, color=config.color, **common)
    if chart_type == "box":
        return px.box(df, x=config.x, y=config.y, color=config.color, **common)
    if chart_type == "heatmap":
        return px.density_heatmap(df, x=config.x, y=config.y, **common)
    # Fallback: bar
    return px.bar(df, x=config.x, y=config.y, color=config.color, **common)
