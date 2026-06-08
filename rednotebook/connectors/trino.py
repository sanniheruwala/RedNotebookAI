"""Trino HTTPS connector."""

from __future__ import annotations

import time
from typing import Any

from pydantic import Field, SecretStr

from rednotebook.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    TableInfo,
    coerce_row_value,
)
from rednotebook.connectors.registry import register_connector


class TrinoConnectionConfig(ConnectionConfig):
    """Configuration for connecting to a Trino server over HTTPS."""

    connector_type: str = Field(default="trino", frozen=True)

    host: str
    port: int = 443
    scheme: str = "https"
    user: str
    password: SecretStr | None = None
    catalog: str | None = None
    schema_name: str | None = Field(default=None, alias="schema")

    http_headers: dict[str, str] = Field(default_factory=dict)
    session_properties: dict[str, str] = Field(default_factory=dict)
    verify_ssl: bool = True
    ca_certificate_path: str | None = None
    source: str = "rednotebook-ai"
    timezone: str | None = None
    query_timeout_seconds: int = 300
    max_preview_rows: int = 100
    max_result_rows: int = 10_000

    model_config = {"populate_by_name": True, "extra": "ignore", "frozen": True}


class TrinoConnector(BaseConnector):
    """Connect to and query a Trino cluster via the official Python client."""

    config: TrinoConnectionConfig

    def __init__(self, config: TrinoConnectionConfig) -> None:
        super().__init__(config)
        self._config = config

    # ----- Connection helpers ------------------------------------------------
    def _client_kwargs(self) -> dict[str, Any]:
        kwargs: dict[str, Any] = {
            "host": self._config.host,
            "port": self._config.port,
            "user": self._config.user,
            "http_scheme": self._config.scheme,
            "source": self._config.source,
        }
        if self._config.catalog:
            kwargs["catalog"] = self._config.catalog
        if self._config.schema_name:
            kwargs["schema"] = self._config.schema_name
        if self._config.timezone:
            kwargs["timezone"] = self._config.timezone
        if self._config.http_headers:
            kwargs["http_headers"] = dict(self._config.http_headers)
        if self._config.session_properties:
            kwargs["session_properties"] = dict(self._config.session_properties)
        if self._config.password is not None:
            from trino.auth import BasicAuthentication  # type: ignore[import-not-found]

            kwargs["auth"] = BasicAuthentication(
                self._config.user,
                self._config.password.get_secret_value(),
            )

        if self._config.scheme == "https":
            if self._config.ca_certificate_path:
                kwargs["verify"] = self._config.ca_certificate_path
            else:
                kwargs["verify"] = self._config.verify_ssl
        return kwargs

    def _connect(self):  # type: ignore[no-untyped-def]
        import trino  # type: ignore[import-not-found]

        return trino.dbapi.connect(**self._client_kwargs())

    # ----- BaseConnector implementation --------------------------------------
    def test_connection(self) -> bool:
        try:
            result = self.run_query("SELECT 1 AS ok", limit=1)
            return result.row_count == 1
        except Exception:
            return False

    def list_catalogs(self) -> list[str]:
        result = self.run_query("SHOW CATALOGS")
        return [next(iter(row.values())) for row in result.rows]

    def list_schemas(self, catalog: str) -> list[str]:
        result = self.run_query(f'SHOW SCHEMAS FROM "{catalog}"')
        return [next(iter(row.values())) for row in result.rows]

    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]:
        sql = (
            "SELECT table_name, table_type "
            f'FROM "{catalog}".information_schema.tables '
            f"WHERE table_schema = '{_escape(schema)}' "
            "ORDER BY table_name"
        )
        result = self.run_query(sql)
        return [
            TableInfo(
                catalog=catalog,
                schema_name=schema,
                name=row["table_name"],
                table_type=row.get("table_type", "BASE TABLE"),
            )
            for row in result.rows
        ]

    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]:
        sql = (
            "SELECT column_name, data_type, is_nullable, comment "
            f'FROM "{catalog}".information_schema.columns '
            f"WHERE table_schema = '{_escape(schema)}' "
            f"AND table_name = '{_escape(table)}' "
            "ORDER BY ordinal_position"
        )
        result = self.run_query(sql)
        return [
            ColumnInfo(
                name=row["column_name"],
                data_type=row["data_type"],
                nullable=(str(row.get("is_nullable", "YES")).upper() == "YES"),
                comment=row.get("comment"),
            )
            for row in result.rows
        ]

    def preview_table(
        self,
        catalog: str,
        schema: str,
        table: str,
        limit: int = 100,
    ) -> QueryResult:
        sql = f'SELECT * FROM "{catalog}"."{schema}"."{table}" LIMIT {int(limit)}'
        return self.run_query(sql, limit=limit)

    def run_query(self, sql: str, limit: int | None = None) -> QueryResult:
        cap = limit if limit is not None else self._config.max_result_rows
        cap = max(0, int(cap))
        started = time.monotonic()

        conn = self._connect()
        try:
            cursor = conn.cursor()
            cursor.execute(sql)
            description = cursor.description or []
            columns = [
                ColumnInfo(
                    name=str(col[0]) if col else "col",
                    data_type=str(col[1]) if col and len(col) > 1 else "unknown",
                    nullable=True,
                )
                for col in description
            ]
            rows: list[dict[str, Any]] = []
            truncated = False
            if columns:
                fetched = cursor.fetchmany(cap + 1) if cap > 0 else []
                if cap > 0 and len(fetched) > cap:
                    fetched = fetched[:cap]
                    truncated = True
                col_names = [c.name for c in columns]
                rows = [
                    {
                        col_names[i]: coerce_row_value(row[i])
                        for i in range(len(col_names))
                    }
                    for row in fetched
                ]
            query_id = getattr(cursor, "query_id", None)
            return QueryResult(
                columns=columns,
                rows=rows,
                row_count=len(rows),
                duration_seconds=time.monotonic() - started,
                query_id=str(query_id) if query_id else None,
                truncated=truncated,
                sql=sql,
            )
        finally:
            try:
                conn.close()
            except Exception:
                pass

    def explain_query(self, sql: str) -> QueryResult:
        return self.run_query(f"EXPLAIN {sql}")


def _escape(value: str) -> str:
    """Escape single quotes for inline SQL."""
    return value.replace("'", "''")


register_connector("trino", TrinoConnector)
