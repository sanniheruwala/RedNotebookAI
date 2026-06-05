"""Chart export helpers (HTML / image)."""

from __future__ import annotations

from pathlib import Path

from rednotebook.connectors.base import QueryResult
from rednotebook.notebook.models import ChartConfig


def export_html(result: QueryResult, config: ChartConfig, path: str | Path) -> Path:
    """Render the chart to a self-contained HTML file."""
    from rednotebook.visualization.charts import build_plotly_figure

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fig = build_plotly_figure(result, config)
    fig.write_html(str(target), include_plotlyjs="cdn", full_html=True)
    return target


def export_png(result: QueryResult, config: ChartConfig, path: str | Path) -> Path:
    """Render the chart to PNG (requires kaleido — optional)."""
    from rednotebook.visualization.charts import build_plotly_figure

    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fig = build_plotly_figure(result, config)
    fig.write_image(str(target), scale=2)
    return target
