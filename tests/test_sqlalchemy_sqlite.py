"""End-to-end smoke tests for the generic SQLAlchemy connector against
SQLite. SQLite needs no driver beyond Python's stdlib + SQLAlchemy, so it
serves as the canonical roundtrip test for the dialect plumbing.
"""

from __future__ import annotations

import pytest

pytest.importorskip("sqlalchemy")

from rednotebook.connectors.registry import (  # noqa: E402
    available_connectors,
    get_connector_class,
)
from rednotebook.connectors.sqlalchemy_dialects import (  # noqa: E402
    SQLiteConnectionConfig,
    SQLiteConnector,
)


def test_sqlite_registered():
    assert "sqlite" in available_connectors()
    assert get_connector_class("sqlite") is SQLiteConnector


def test_eleven_dialects_registered():
    expected = {
        "postgresql",
        "mysql",
        "mariadb",
        "sqlite",
        "mssql",
        "snowflake",
        "bigquery",
        "redshift",
        "oracle",
        "clickhouse",
        "databricks",
    }
    assert expected.issubset(set(available_connectors()))


def test_inmemory_roundtrip():
    c = SQLiteConnector(
        SQLiteConnectionConfig(
            connection_name="t",
            connector_type="sqlite",
            database=":memory:",
        )
    )
    assert c.test_connection() is True
    # CREATE / INSERT don't return rows — the connector should still happily
    # commit them via the SQLAlchemy `connection.commit()` path.
    c.run_query("CREATE TABLE nums (n INT, label TEXT)")
    c.run_query("INSERT INTO nums VALUES (1,'a'),(2,'b'),(3,'c')")
    # In-memory SQLite is per-engine. Our connector reuses one engine, so
    # both writes and the SELECT below see the same database.
    result = c.run_query("SELECT label, n * n AS sq FROM nums ORDER BY n")
    assert result.row_count == 3
    assert result.rows == [
        {"label": "a", "sq": 1},
        {"label": "b", "sq": 4},
        {"label": "c", "sq": 9},
    ]
    assert [col.name for col in result.columns] == ["label", "sq"]


def test_metadata_introspection(tmp_path):
    path = tmp_path / "scratch.sqlite"
    c = SQLiteConnector(
        SQLiteConnectionConfig(
            connection_name="t",
            connector_type="sqlite",
            database=str(path),
        )
    )
    c.run_query("CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)")
    c.run_query("INSERT INTO users (name) VALUES ('Ada'), ('Bea')")

    schemas = c.list_schemas("main")
    assert "main" in schemas
    tables = c.list_tables("main", "")
    names = [t.name for t in tables]
    assert "users" in names
    cols = {col.name: col for col in c.list_columns("main", "", "users")}
    assert "id" in cols
    assert "name" in cols
    # SQLite reports NOT NULL columns as nullable=False after introspection.
    assert cols["name"].nullable is False


def test_result_truncation():
    cfg = SQLiteConnectionConfig(
        connection_name="t",
        connector_type="sqlite",
        database=":memory:",
        max_result_rows=3,
    )
    c = SQLiteConnector(cfg)
    rows = c.run_query(
        "WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<10) "
        "SELECT n FROM seq"
    )
    assert rows.row_count == 3
    assert rows.truncated is True
