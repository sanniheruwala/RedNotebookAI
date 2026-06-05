"""Pick a sensible chart from column types + sample data."""

from __future__ import annotations

from typing import Any

from rednotebook.ai.base import ChartSuggestion, DataFrameSchema

SUPPORTED_CHART_TYPES: tuple[str, ...] = (
    "line",
    "bar",
    "stacked_bar",
    "area",
    "scatter",
    "pie",
    "donut",
    "heatmap",
    "histogram",
    "box",
    "time_series",
    "kpi",
    "table",
)


def _is_temporal(data_type: str) -> bool:
    t = data_type.lower()
    return any(tok in t for tok in ("date", "time", "timestamp"))


def _is_numeric(data_type: str) -> bool:
    t = data_type.lower()
    return any(tok in t for tok in ("int", "decimal", "double", "real", "numeric", "float", "bigint"))


def _is_categorical(data_type: str) -> bool:
    t = data_type.lower()
    return any(tok in t for tok in ("varchar", "char", "string", "text", "bool", "uuid"))


def recommend_chart(
    schema: DataFrameSchema,
    sample: list[dict[str, Any]] | None = None,
) -> ChartSuggestion:
    """Recommend a chart shape based on column types."""
    cols = schema.columns or []
    if not cols:
        return ChartSuggestion(chart_type="table", reason="No columns available")

    temporal = [c for c in cols if _is_temporal(c["data_type"])]
    numeric = [c for c in cols if _is_numeric(c["data_type"])]
    categorical = [c for c in cols if _is_categorical(c["data_type"])]

    # Single numeric column → KPI
    if len(cols) == 1 and len(numeric) == 1:
        return ChartSuggestion(
            chart_type="kpi",
            y=numeric[0]["name"],
            title=numeric[0]["name"],
            reason="Single numeric metric",
        )

    # Time series → line / time_series
    if temporal and numeric:
        return ChartSuggestion(
            chart_type="time_series",
            x=temporal[0]["name"],
            y=numeric[0]["name"],
            color=categorical[0]["name"] if categorical else None,
            reason="Temporal x-axis + numeric measure",
        )

    # Category + numeric → bar
    if categorical and numeric:
        return ChartSuggestion(
            chart_type="bar",
            x=categorical[0]["name"],
            y=numeric[0]["name"],
            color=categorical[1]["name"] if len(categorical) > 1 else None,
            aggregation="sum",
            reason="Categorical x-axis + numeric measure",
        )

    # Two numeric columns → scatter
    if len(numeric) >= 2:
        return ChartSuggestion(
            chart_type="scatter",
            x=numeric[0]["name"],
            y=numeric[1]["name"],
            color=categorical[0]["name"] if categorical else None,
            reason="Two numeric columns",
        )

    # Only categorical → pie of distribution of first column
    if categorical and not numeric:
        return ChartSuggestion(
            chart_type="pie",
            x=categorical[0]["name"],
            reason="Categorical distribution",
        )

    return ChartSuggestion(chart_type="table", reason="Fallback to table")
