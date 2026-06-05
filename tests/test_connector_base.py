"""Base connector interface tests."""

import pytest

pytest.importorskip("pydantic")

from rednotebook.connectors.base import (  # noqa: E402
    BaseConnector,
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    TableInfo,
)


class _FakeConnector(BaseConnector):
    def test_connection(self) -> bool:
        return True

    def list_catalogs(self) -> list[str]:
        return ["c1"]

    def list_schemas(self, catalog: str) -> list[str]:
        return ["s1"]

    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]:
        return [TableInfo(catalog=catalog, schema_name=schema, name="t1")]

    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]:
        return [ColumnInfo(name="id", data_type="bigint")]

    def preview_table(self, catalog, schema, table, limit=100):
        return QueryResult(
            columns=[ColumnInfo(name="id", data_type="bigint")],
            rows=[{"id": 1}, {"id": 2}],
            row_count=2,
            duration_seconds=0.01,
        )

    def run_query(self, sql: str, limit=None):
        return QueryResult(
            columns=[ColumnInfo(name="n", data_type="bigint")],
            rows=[{"n": 1}],
            row_count=1,
            duration_seconds=0.0,
            sql=sql,
        )

    def explain_query(self, sql: str):
        return self.run_query(f"EXPLAIN {sql}")


def test_base_connector_contract():
    cfg = ConnectionConfig(connection_name="dummy", connector_type="fake")
    connector = _FakeConnector(cfg)
    assert connector.test_connection() is True
    assert connector.list_catalogs() == ["c1"]
    tables = connector.list_tables("c1", "s1")
    assert tables[0].fully_qualified == "c1.s1.t1"
    cols = connector.list_columns("c1", "s1", "t1")
    assert cols[0].name == "id"
    preview = connector.preview_table("c1", "s1", "t1")
    assert preview.row_count == 2


def test_query_result_to_dataframe():
    pd = pytest.importorskip("pandas")
    qr = QueryResult(
        columns=[ColumnInfo(name="a", data_type="int")],
        rows=[{"a": 1}, {"a": 2}],
        row_count=2,
        duration_seconds=0.0,
    )
    df = qr.to_dataframe()
    assert isinstance(df, pd.DataFrame)
    assert list(df.columns) == ["a"]
    assert df["a"].tolist() == [1, 2]
