"""Result profiling: per-column statistics, PII flags, summaries."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from rednotebook.connectors.base import ColumnInfo, QueryResult
from rednotebook.profiling.pii_detector import (
    PIIClassification,
    classify_columns,
)
from rednotebook.profiling.stats import (
    histogram,
    is_number,
    numeric_summary,
    related_columns,
    top_values,
)


@dataclass
class ColumnProfile:
    name: str
    data_type: str
    null_count: int
    null_percent: float
    distinct_count: int
    numeric_summary: dict[str, float] | None
    top_values: list[dict[str, Any]]
    pii_classification: PIIClassification
    histogram: list[dict[str, float]] | None = None


@dataclass
class ResultProfile:
    row_count: int
    column_count: int
    columns: list[ColumnProfile]
    duplicate_check_columns: list[str] = field(default_factory=list)
    duplicate_count: int = 0
    related_columns: list[dict[str, Any]] = field(default_factory=list)

    @property
    def sensitive_columns(self) -> list[str]:
        return [
            c.name
            for c in self.columns
            if c.pii_classification in {"PII", "Restricted"}
        ]

    def to_dict(self) -> dict[str, Any]:
        return {
            "row_count": self.row_count,
            "column_count": self.column_count,
            "duplicate_count": self.duplicate_count,
            "duplicate_check_columns": list(self.duplicate_check_columns),
            "sensitive_columns": self.sensitive_columns,
            "related_columns": list(self.related_columns),
            "columns": [
                {
                    "name": c.name,
                    "data_type": c.data_type,
                    "null_count": c.null_count,
                    "null_percent": c.null_percent,
                    "distinct_count": c.distinct_count,
                    "numeric_summary": c.numeric_summary,
                    "top_values": c.top_values,
                    "pii_classification": c.pii_classification,
                    "histogram": c.histogram,
                }
                for c in self.columns
            ],
        }


def profile_result(
    result: QueryResult,
    *,
    top_k: int = 5,
    duplicate_columns: list[str] | None = None,
) -> ResultProfile:
    """Profile a QueryResult. Pure-Python, no pandas dependency."""
    rows = result.rows
    columns: list[ColumnInfo] = result.columns
    n = len(rows)
    pii_map = classify_columns(columns, rows)

    col_profiles: list[ColumnProfile] = []
    column_values: dict[str, list[Any]] = {}
    for col in columns:
        values = [row.get(col.name) for row in rows]
        column_values[col.name] = values
        null_count = sum(1 for v in values if v is None)
        non_null = [v for v in values if v is not None]
        distinct = len({v if isinstance(v, (str, int, float, bool)) else str(v) for v in non_null})
        is_numeric_col = any(is_number(v) for v in values)
        numeric = numeric_summary(values) if is_numeric_col else None
        hist = histogram(values) if is_numeric_col else None
        col_profiles.append(
            ColumnProfile(
                name=col.name,
                data_type=col.data_type,
                null_count=null_count,
                null_percent=(null_count / n * 100.0) if n else 0.0,
                distinct_count=distinct,
                numeric_summary=numeric,
                top_values=top_values(values, k=top_k),
                pii_classification=pii_map.get(col.name, "Unknown"),
                histogram=hist,
            )
        )

    related = related_columns(column_values) if len(rows) >= 5 else []

    duplicate_check: list[str] = duplicate_columns or []
    duplicate_count = 0
    if duplicate_check:
        seen: set[tuple[Any, ...]] = set()
        for row in rows:
            key = tuple(row.get(c) for c in duplicate_check)
            if key in seen:
                duplicate_count += 1
            else:
                seen.add(key)

    return ResultProfile(
        row_count=n,
        column_count=len(columns),
        columns=col_profiles,
        duplicate_check_columns=duplicate_check,
        duplicate_count=duplicate_count,
        related_columns=related,
    )
