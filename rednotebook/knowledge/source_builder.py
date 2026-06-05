"""Helpers that turn notebook artifacts into KnowledgeSource records."""

from __future__ import annotations

from typing import Any

from rednotebook.connectors.base import ColumnInfo, QueryResult
from rednotebook.knowledge.models import KnowledgeSource, SourceType
from rednotebook.notebook.models import ChartConfig
from rednotebook.profiling.profiler import ResultProfile
from rednotebook.security.secrets import mask_secrets


def build_sql_source(
    notebook_id: str,
    title: str,
    sql: str,
    metadata: dict[str, Any] | None = None,
) -> KnowledgeSource:
    return KnowledgeSource(
        notebook_id=notebook_id,
        source_type=SourceType.SQL_QUERY,
        title=title,
        content=mask_secrets(sql),
        metadata=metadata or {},
    )


def build_result_source(
    notebook_id: str,
    title: str,
    result: QueryResult,
    *,
    summary: str | None = None,
    include_sample_rows: bool = False,
    sample_row_limit: int = 10,
) -> KnowledgeSource:
    payload: dict[str, Any] = {
        "row_count": result.row_count,
        "column_count": len(result.columns),
        "duration_seconds": result.duration_seconds,
        "truncated": result.truncated,
        "columns": [
            {"name": c.name, "data_type": c.data_type} for c in result.columns
        ],
    }
    if include_sample_rows:
        payload["sample_rows"] = result.rows[: max(0, sample_row_limit)]
    return KnowledgeSource(
        notebook_id=notebook_id,
        source_type=SourceType.QUERY_RESULT,
        title=title,
        content=summary or "",
        metadata=payload,
    )


def build_schema_source(
    notebook_id: str,
    title: str,
    columns: list[ColumnInfo],
    *,
    catalog: str | None = None,
    schema_name: str | None = None,
    table: str | None = None,
) -> KnowledgeSource:
    return KnowledgeSource(
        notebook_id=notebook_id,
        source_type=SourceType.SCHEMA,
        title=title,
        content="",
        metadata={
            "catalog": catalog,
            "schema_name": schema_name,
            "table": table,
            "columns": [
                {"name": c.name, "data_type": c.data_type, "nullable": c.nullable}
                for c in columns
            ],
        },
    )


def build_profile_source(
    notebook_id: str,
    title: str,
    profile: ResultProfile,
) -> KnowledgeSource:
    return KnowledgeSource(
        notebook_id=notebook_id,
        source_type=SourceType.PROFILE,
        title=title,
        content="",
        metadata=profile.to_dict(),
    )


def build_chart_source(
    notebook_id: str,
    title: str,
    chart_config: ChartConfig,
    *,
    explanation: str | None = None,
) -> KnowledgeSource:
    return KnowledgeSource(
        notebook_id=notebook_id,
        source_type=SourceType.CHART,
        title=title,
        content=explanation or "",
        metadata={"chart_config": chart_config.model_dump()},
    )


def build_markdown_source(
    notebook_id: str,
    title: str,
    body: str,
) -> KnowledgeSource:
    return KnowledgeSource(
        notebook_id=notebook_id,
        source_type=SourceType.MARKDOWN,
        title=title,
        content=body,
        metadata={},
    )
