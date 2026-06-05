"""Query execution endpoints (guard-aware)."""

from __future__ import annotations

from fastapi import APIRouter

from rednotebook.config.settings import get_settings
from rednotebook.notebook.runner import run_sql
from rednotebook.security.sql_guard import check_sql
from rednotebook.server.dependencies import build_trino_connector
from rednotebook.server.schemas import (
    ExplainQueryRequest,
    GuardInfo,
    QueryResultPayload,
    RunQueryRequest,
    RunQueryResponse,
)

router = APIRouter()


def _guard_info(guard) -> GuardInfo:  # type: ignore[no-untyped-def]
    return GuardInfo(
        verdict=guard.verdict.value,
        reasons=list(guard.reasons),
        dangerous_keywords=list(guard.dangerous_keywords),
        statement_type=guard.statement_type,
    )


def _result_payload(result) -> QueryResultPayload:  # type: ignore[no-untyped-def]
    return QueryResultPayload(
        columns=result.columns,
        rows=result.rows,
        row_count=result.row_count,
        duration_seconds=result.duration_seconds,
        truncated=result.truncated,
        query_id=result.query_id,
        sql=result.sql,
    )


@router.post("/run", response_model=RunQueryResponse)
def run(payload: RunQueryRequest) -> RunQueryResponse:
    settings = get_settings()
    connector = build_trino_connector(payload.connection)
    execution = run_sql(
        payload.sql,
        connector,
        limit=payload.limit,
        allow_write_queries=settings.allow_write_queries,
        confirm_write=payload.confirm_write,
    )
    return RunQueryResponse(
        ok=execution.ok,
        guard=_guard_info(execution.guard),
        result=_result_payload(execution.result) if execution.result else None,
        error=execution.error,
    )


@router.post("/explain", response_model=RunQueryResponse)
def explain(payload: ExplainQueryRequest) -> RunQueryResponse:
    guard = check_sql(payload.sql, allow_write_queries=False)
    if guard.is_blocked:
        return RunQueryResponse(
            ok=False,
            guard=_guard_info(guard),
            result=None,
            error="; ".join(guard.reasons),
        )
    connector = build_trino_connector(payload.connection)
    try:
        result = connector.explain_query(payload.sql)
        return RunQueryResponse(
            ok=True,
            guard=_guard_info(guard),
            result=_result_payload(result),
        )
    except Exception as exc:
        return RunQueryResponse(
            ok=False,
            guard=_guard_info(guard),
            result=None,
            error=str(exc),
        )


@router.post("/guard", response_model=GuardInfo)
def guard_only(sql: str) -> GuardInfo:
    settings = get_settings()
    return _guard_info(check_sql(sql, allow_write_queries=settings.allow_write_queries))
