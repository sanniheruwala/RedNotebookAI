"""Profiler tests."""

import pytest

pytest.importorskip("pydantic")

from rednotebook.connectors.base import ColumnInfo, QueryResult  # noqa: E402
from rednotebook.profiling.profiler import profile_result  # noqa: E402


def _result():
    return QueryResult(
        columns=[
            ColumnInfo(name="id", data_type="bigint"),
            ColumnInfo(name="email", data_type="varchar"),
            ColumnInfo(name="amount", data_type="double"),
        ],
        rows=[
            {"id": 1, "email": "a@x.com", "amount": 10.5},
            {"id": 2, "email": "b@x.com", "amount": 12.0},
            {"id": 3, "email": None, "amount": None},
            {"id": 1, "email": "a@x.com", "amount": 10.5},  # duplicate of row 1
        ],
        row_count=4,
        duration_seconds=0.0,
    )


def test_basic_stats():
    p = profile_result(_result())
    assert p.row_count == 4
    assert p.column_count == 3
    by_name = {c.name: c for c in p.columns}
    assert by_name["amount"].null_count == 1
    assert by_name["amount"].numeric_summary is not None
    assert by_name["amount"].numeric_summary["min"] == 10.5
    assert by_name["email"].pii_classification == "PII"


def test_duplicate_detection():
    p = profile_result(_result(), duplicate_columns=["id"])
    # Two of the four rows share id=1.
    assert p.duplicate_count == 1
    assert p.duplicate_check_columns == ["id"]
