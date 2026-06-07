"""Chart suggestion and spec endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from rednotebook.ai.base import DataFrameSchema
from rednotebook.ai.errors import AIProviderError
from rednotebook.ai.registry import get_provider
from rednotebook.connectors.base import QueryResult
from rednotebook.server.schemas import (
    ChartBuildRequest,
    ChartBuildResponse,
    ChartSuggestRequest,
    ChartSuggestResponse,
)
from rednotebook.visualization.charts import build_chart_spec

router = APIRouter()


@router.post("/suggest", response_model=ChartSuggestResponse)
def suggest(request: ChartSuggestRequest) -> ChartSuggestResponse:
    schema = DataFrameSchema(
        columns=[{"name": c.name, "data_type": c.data_type} for c in request.columns],
        row_count=request.row_count,
    )
    # Delegate to the active provider so a configured LLM actually drives
    # auto-suggest. Each provider (anthropic / openai / mock) implements
    # its own suggest_chart and falls back to the deterministic recommender
    # when the model returns something unparseable.
    provider = get_provider()
    try:
        suggestion = provider.suggest_chart(schema, request.sample_rows)
    except AIProviderError as exc:
        model = f" / {exc.model}" if exc.model else ""
        raise HTTPException(
            status_code=502,
            detail=f"{exc.provider}{model}: {exc}",
        ) from exc
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
