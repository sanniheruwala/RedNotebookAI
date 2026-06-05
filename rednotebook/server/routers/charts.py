"""Chart suggestion and spec endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from rednotebook.ai.base import DataFrameSchema
from rednotebook.connectors.base import QueryResult
from rednotebook.server.schemas import (
    ChartBuildRequest,
    ChartBuildResponse,
    ChartSuggestRequest,
    ChartSuggestResponse,
)
from rednotebook.visualization.charts import build_chart_spec
from rednotebook.visualization.recommender import recommend_chart

router = APIRouter()


@router.post("/suggest", response_model=ChartSuggestResponse)
def suggest(request: ChartSuggestRequest) -> ChartSuggestResponse:
    schema = DataFrameSchema(
        columns=[{"name": c.name, "data_type": c.data_type} for c in request.columns],
        row_count=request.row_count,
    )
    suggestion = recommend_chart(schema, request.sample_rows)
    return ChartSuggestResponse(suggestion=suggestion)


@router.post("/build", response_model=ChartBuildResponse)
def build(request: ChartBuildRequest) -> ChartBuildResponse:
    result = QueryResult(
        columns=list(request.columns),
        rows=list(request.rows),
        row_count=request.row_count,
        duration_seconds=0.0,
        truncated=request.truncated,
    )
    spec = build_chart_spec(result, request.chart_config)
    return ChartBuildResponse(spec=spec)
