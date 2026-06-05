"""Build privacy-safe AI context from connectors and query results."""

from __future__ import annotations

from typing import Any

from rednotebook.ai.base import AIContext, DataFrameSchema, ResultContext
from rednotebook.config.settings import AIContextMode, Settings, get_settings
from rednotebook.connectors.base import ColumnInfo, QueryResult
from rednotebook.profiling.pii_detector import classify_columns
from rednotebook.security.masking import mask_rows
from rednotebook.security.secrets import mask_secrets


def build_ai_context(
    *,
    settings: Settings | None = None,
    catalog: str | None = None,
    schema_name: str | None = None,
    table: str | None = None,
    columns: list[ColumnInfo] | None = None,
    sample_rows: list[dict[str, Any]] | None = None,
    aggregated_stats: dict[str, Any] | None = None,
    business_terms: dict[str, str] | None = None,
    mode_override: AIContextMode | None = None,
) -> AIContext:
    """Build an AIContext respecting the user's privacy settings."""
    cfg = settings or get_settings()
    mode: AIContextMode = mode_override or cfg.ai_context_mode

    schemas = [
        {"name": c.name, "data_type": c.data_type, "nullable": c.nullable}
        for c in (columns or [])
    ]

    safe_samples: list[dict[str, Any]] = []
    if (
        cfg.ai_allow_sample_rows
        and mode == "schema_stats_samples"
        and sample_rows
    ):
        rows = sample_rows[: max(0, cfg.ai_sample_row_limit)]
        if cfg.ai_mask_pii:
            classification = classify_columns(columns or [], rows)
            sensitive = {
                col
                for col, label in classification.items()
                if label in {"PII", "Restricted"}
            }
            if sensitive:
                rows = mask_rows(rows, sensitive)
        safe_samples = rows

    stats: dict[str, Any] | None
    if mode == "schema_only":
        stats = None
    else:
        stats = aggregated_stats or {}

    return AIContext(
        catalog=catalog,
        schema_name=schema_name,
        table=table,
        schemas=schemas,
        sample_rows=safe_samples,
        aggregated_stats=stats,
        business_terms=business_terms or {},
        mode=mode,
    )


def build_result_context(
    sql: str,
    result: QueryResult,
    *,
    settings: Settings | None = None,
    aggregated_stats: dict[str, Any] | None = None,
    notes: str | None = None,
) -> ResultContext:
    """Build a ResultContext for summarization, masking secrets in SQL."""
    cfg = settings or get_settings()
    rows: list[dict[str, Any]] = []
    if (
        cfg.ai_allow_sample_rows
        and cfg.ai_context_mode == "schema_stats_samples"
        and result.rows
    ):
        rows = result.rows[: max(0, cfg.ai_sample_row_limit)]
        if cfg.ai_mask_pii:
            classification = classify_columns(result.columns, rows)
            sensitive = {
                col for col, label in classification.items() if label in {"PII", "Restricted"}
            }
            if sensitive:
                rows = mask_rows(rows, sensitive)

    return ResultContext(
        sql=mask_secrets(sql),
        schema=DataFrameSchema.from_query_result(result),
        aggregated_stats=aggregated_stats or {},
        sample_rows=rows,
        notes=notes,
    )
