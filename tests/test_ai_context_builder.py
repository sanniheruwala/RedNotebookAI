"""AI context builder tests — verifies privacy defaults and masking."""

import pytest

pytest.importorskip("pydantic")

from rednotebook.ai.context_builder import build_ai_context, build_result_context  # noqa: E402
from rednotebook.config.settings import Settings  # noqa: E402
from rednotebook.connectors.base import ColumnInfo, QueryResult  # noqa: E402


def test_default_context_omits_sample_rows():
    settings = Settings(ai_allow_sample_rows=False)
    ctx = build_ai_context(
        settings=settings,
        columns=[ColumnInfo(name="email", data_type="varchar")],
        sample_rows=[{"email": "a@x.com"}],
    )
    assert ctx.sample_rows == []


def test_samples_included_when_allowed_and_mode_supports():
    settings = Settings(
        ai_allow_sample_rows=True,
        ai_context_mode="schema_stats_samples",
        ai_mask_pii=True,
        ai_sample_row_limit=5,
    )
    ctx = build_ai_context(
        settings=settings,
        columns=[
            ColumnInfo(name="email", data_type="varchar"),
            ColumnInfo(name="amount", data_type="double"),
        ],
        sample_rows=[{"email": "a@x.com", "amount": 1.5}],
    )
    assert ctx.sample_rows[0]["email"] == "***MASKED***"
    assert ctx.sample_rows[0]["amount"] == 1.5


def test_secrets_masked_in_result_context():
    settings = Settings()
    result = QueryResult(
        columns=[ColumnInfo(name="a", data_type="int")],
        rows=[{"a": 1}],
        row_count=1,
        duration_seconds=0.0,
    )
    sql = "SELECT * FROM t WHERE api_key='AKIAABCDEFGHIJKLMNOP'"
    ctx = build_result_context(sql, result, settings=settings)
    assert "AKIAABCDEFGHIJKLMNOP" not in ctx.sql
