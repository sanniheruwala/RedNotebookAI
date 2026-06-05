"""PII / restricted column detection tests."""

import pytest

pytest.importorskip("pydantic")

from rednotebook.connectors.base import ColumnInfo  # noqa: E402
from rednotebook.profiling.pii_detector import (  # noqa: E402
    classify_column,
    classify_columns,
)


def test_email_column_name():
    assert classify_column(ColumnInfo(name="email", data_type="varchar"), []) == "PII"


def test_password_column_name():
    assert classify_column(ColumnInfo(name="password", data_type="varchar"), []) == "Restricted"


def test_email_value_pattern():
    col = ColumnInfo(name="contact", data_type="varchar")
    values = ["alice@example.com", "bob@example.com", "carol@example.com"]
    assert classify_column(col, values) == "PII"


def test_token_value_pattern():
    col = ColumnInfo(name="value", data_type="varchar")
    values = ["Bearer abc123def456", "Bearer xyz", "Bearer 12345"]
    assert classify_column(col, values) == "Restricted"


def test_numeric_id_is_not_sensitive():
    assert classify_column(ColumnInfo(name="id", data_type="bigint"), [1, 2, 3]) == "NotSensitive"


def test_classify_columns_map():
    cols = [
        ColumnInfo(name="email", data_type="varchar"),
        ColumnInfo(name="amount", data_type="decimal(10,2)"),
    ]
    rows = [{"email": "a@x.com", "amount": 1.5}]
    result = classify_columns(cols, rows)
    assert result["email"] == "PII"
    assert result["amount"] == "NotSensitive"
