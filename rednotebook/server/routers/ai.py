"""AI endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from rednotebook.ai.base import DataFrameSchema, ResultContext
from rednotebook.ai.context_builder import build_ai_context
from rednotebook.ai.registry import get_provider
from rednotebook.config.settings import get_settings
from rednotebook.server.schemas import (
    AIContextPayload,
    AIExplainResultRequest,
    AIExplainSQLRequest,
    AIGenerateSQLRequest,
    AIGenerateSQLResponse,
    AIOptimizeSQLRequest,
    AITextResponse,
)

router = APIRouter()


def _to_context(payload: AIContextPayload):  # type: ignore[no-untyped-def]
    return build_ai_context(
        catalog=payload.catalog,
        schema_name=payload.schema_name,
        table=payload.table,
        columns=list(payload.columns),
        sample_rows=list(payload.sample_rows),
        aggregated_stats=payload.aggregated_stats,
        business_terms=dict(payload.business_terms),
    )


@router.post("/generate-sql", response_model=AIGenerateSQLResponse)
def generate_sql(request: AIGenerateSQLRequest) -> AIGenerateSQLResponse:
    provider = get_provider()
    context = _to_context(request.context)
    sql = provider.generate_sql(request.prompt, context)
    return AIGenerateSQLResponse(sql=sql, provider=provider.name)


@router.post("/explain-sql", response_model=AITextResponse)
def explain_sql(request: AIExplainSQLRequest) -> AITextResponse:
    provider = get_provider()
    text = provider.explain_sql(request.sql, _to_context(request.context))
    return AITextResponse(text=text, provider=provider.name)


@router.post("/optimize-sql", response_model=AITextResponse)
def optimize_sql(request: AIOptimizeSQLRequest) -> AITextResponse:
    provider = get_provider()
    text = provider.optimize_sql(request.sql, _to_context(request.context))
    return AITextResponse(text=text, provider=provider.name)


@router.post("/explain-result", response_model=AITextResponse)
def explain_result(request: AIExplainResultRequest) -> AITextResponse:
    settings = get_settings()
    provider = get_provider(settings)
    schema = DataFrameSchema(
        columns=[{"name": c.name, "data_type": c.data_type} for c in request.columns],
        row_count=request.row_count,
    )
    context = ResultContext(
        sql=request.sql,
        schema=schema,
        aggregated_stats=request.aggregated_stats,
        sample_rows=request.sample_rows if settings.ai_allow_sample_rows else [],
    )
    text = provider.summarize_result(context)
    return AITextResponse(text=text, provider=provider.name)
