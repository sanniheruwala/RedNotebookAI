"""AI endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from rednotebook.ai.base import (
    AIAvailableTableSchema,
    AIChatTurn,
    DataFrameSchema,
    ResultContext,
)
from rednotebook.ai.context_builder import build_ai_context
from rednotebook.ai.errors import AIProviderError
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
    available = [
        AIAvailableTableSchema(
            catalog=t.catalog,
            schema_name=t.schema_name,
            name=t.name,
            columns=[
                {"name": c.name, "data_type": c.data_type} for c in t.columns
            ],
        )
        for t in payload.available_tables
    ]
    history = [AIChatTurn(role=h.role, content=h.content) for h in payload.history]
    return build_ai_context(
        catalog=payload.catalog,
        schema_name=payload.schema_name,
        table=payload.table,
        columns=list(payload.columns),
        sample_rows=list(payload.sample_rows),
        aggregated_stats=payload.aggregated_stats,
        business_terms=dict(payload.business_terms),
        available_tables=available,
        history=history,
        dialect=payload.dialect,
    )


_CLARIFY_PREFIX = "CLARIFY:"


def _split_sql_or_clarification(text: str) -> tuple[str, str | None]:
    """Detect ``CLARIFY: ...`` responses from the SQL generator.

    The model is instructed to emit a single ``CLARIFY: <question>`` line
    when it can't pick a table or column with confidence. Anything else
    is treated as SQL.
    """
    stripped = (text or "").strip()
    if stripped.upper().startswith(_CLARIFY_PREFIX):
        question = stripped[len(_CLARIFY_PREFIX) :].strip()
        return "", question or None
    return stripped, None


def _provider_error_detail(exc: AIProviderError) -> str:
    model = f" / {exc.model}" if exc.model else ""
    return f"{exc.provider}{model}: {exc}"


@router.post("/generate-sql", response_model=AIGenerateSQLResponse)
def generate_sql(request: AIGenerateSQLRequest) -> AIGenerateSQLResponse:
    provider = get_provider()
    context = _to_context(request.context)
    try:
        raw = provider.generate_sql(request.prompt, context)
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=_provider_error_detail(exc)) from exc
    sql, clarification = _split_sql_or_clarification(raw)
    return AIGenerateSQLResponse(
        sql=sql,
        provider=provider.name,
        clarification=clarification,
    )


@router.post("/explain-sql", response_model=AITextResponse)
def explain_sql(request: AIExplainSQLRequest) -> AITextResponse:
    provider = get_provider()
    try:
        text = provider.explain_sql(request.sql, _to_context(request.context))
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=_provider_error_detail(exc)) from exc
    return AITextResponse(text=text, provider=provider.name)


@router.post("/optimize-sql", response_model=AITextResponse)
def optimize_sql(request: AIOptimizeSQLRequest) -> AITextResponse:
    provider = get_provider()
    try:
        text = provider.optimize_sql(request.sql, _to_context(request.context))
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=_provider_error_detail(exc)) from exc
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
    try:
        text = provider.summarize_result(context)
    except AIProviderError as exc:
        raise HTTPException(status_code=502, detail=_provider_error_detail(exc)) from exc
    return AITextResponse(text=text, provider=provider.name)
