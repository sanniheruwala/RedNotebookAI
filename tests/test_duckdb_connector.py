"""DuckDB connector tests (real DuckDB; no external service needed)."""

import csv

import pytest

pytest.importorskip("pydantic")
pytest.importorskip("duckdb")

from rednotebook.connectors.duckdb import (  # noqa: E402
    DuckDBConnectionConfig,
    DuckDBConnector,
)
from rednotebook.connectors.registry import (  # noqa: E402
    available_connectors,
    get_connector_class,
)


def test_duckdb_registered():
    assert "duckdb" in available_connectors()
    assert get_connector_class("duckdb") is DuckDBConnector


def test_in_memory_select_works():
    c = DuckDBConnector(DuckDBConnectionConfig(connection_name="t"))
    assert c.test_connection() is True
    result = c.run_query("SELECT 1 AS one, 'hi' AS greeting")
    assert result.row_count == 1
    assert result.rows == [{"one": 1, "greeting": "hi"}]


def test_in_memory_csv_aggregate(tmp_path):
    csv_path = tmp_path / "orders.csv"
    with csv_path.open("w") as f:
        w = csv.writer(f)
        w.writerow(["id", "customer", "amount"])
        w.writerows([(1, "Alice", 100), (2, "Bob", 250), (3, "Alice", 75)])

    c = DuckDBConnector(
        DuckDBConnectionConfig(connection_name="t", database=":memory:")
    )
    result = c.run_query(
        f"SELECT customer, SUM(amount) AS total "
        f"FROM read_csv_auto('{csv_path}') "
        f"GROUP BY customer ORDER BY total DESC"
    )
    assert [r["customer"] for r in result.rows] == ["Bob", "Alice"]
    assert int(result.rows[0]["total"]) == 250
    assert int(result.rows[1]["total"]) == 175


def test_file_based_persistence(tmp_path):
    db_path = tmp_path / "demo.duckdb"
    cfg = DuckDBConnectionConfig(connection_name="t", database=str(db_path))
    c = DuckDBConnector(cfg)
    c.run_query("CREATE TABLE nums (n INT)")
    c.run_query("INSERT INTO nums VALUES (10), (20), (30)")
    result = c.run_query("SELECT SUM(n) AS total FROM nums")
    assert result.rows == [{"total": 60}]


def test_metadata_introspection(tmp_path):
    db_path = tmp_path / "meta.duckdb"
    cfg = DuckDBConnectionConfig(connection_name="t", database=str(db_path))
    c = DuckDBConnector(cfg)
    c.run_query("CREATE TABLE users (id INT, name VARCHAR)")
    c.run_query("INSERT INTO users VALUES (1, 'Alice')")

    catalogs = c.list_catalogs()
    assert "meta" in catalogs  # filename basename becomes the catalog
    schemas = c.list_schemas("meta")
    assert "main" in schemas
    tables = c.list_tables("meta", "main")
    table_names = [t.name for t in tables]
    assert "users" in table_names
    columns = c.list_columns("meta", "main", "users")
    by_name = {col.name: col for col in columns}
    assert by_name["id"].data_type.upper().startswith("INT")
    assert by_name["name"].data_type.upper().startswith("VARCHAR")


def test_result_truncation(tmp_path):
    cfg = DuckDBConnectionConfig(
        connection_name="t", database=":memory:", max_result_rows=5
    )
    c = DuckDBConnector(cfg)
    result = c.run_query("SELECT * FROM range(10) AS t(n)")
    assert result.row_count == 5
    assert result.truncated is True
