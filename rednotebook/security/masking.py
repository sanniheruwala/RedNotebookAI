"""Value-level masking for sensitive data."""

from __future__ import annotations

from typing import Any


def mask_value(value: Any) -> str:
    """Return a placeholder for any value (used for PII columns)."""
    if value is None:
        return ""
    return "***MASKED***"


def mask_row(row: dict[str, Any], sensitive_columns: set[str]) -> dict[str, Any]:
    """Return a new row with sensitive columns masked."""
    return {k: (mask_value(v) if k in sensitive_columns else v) for k, v in row.items()}


def mask_rows(rows: list[dict[str, Any]], sensitive_columns: set[str]) -> list[dict[str, Any]]:
    """Return a new list of rows with sensitive columns masked."""
    return [mask_row(row, sensitive_columns) for row in rows]
