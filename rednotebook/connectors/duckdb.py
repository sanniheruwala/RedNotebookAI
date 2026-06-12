"""DuckDB connector. In-process, no external server required.

DuckDB is ideal for the "try the app without standing up a warehouse" flow:
the user picks ``:memory:`` (transient) or a local ``*.duckdb`` file and
queries it like any other catalog. Files referenced via ``read_csv_auto``
or ``read_parquet`` are resolved relative to the configured working dir.

Catalog/schema mapping:
- DuckDB's catalogs/schemas line up with ``information_schema`` so we can
  reuse the same ``list_*`` shape as the Trino connector. The default
  catalog name DuckDB exposes is the basename of the file (or ``memory``
  for in-memory connections).
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

from pydantic import Field

from rednotebook.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    TableInfo,
    coerce_row_value,
)
from rednotebook.connectors.registry import register_connector


class DuckDBConnectionConfig(ConnectionConfig):
    """Configuration for an embedded DuckDB connection."""

    connector_type: str = Field(default="duckdb", frozen=True)

    # ":memory:" → ephemeral; otherwise an absolute or relative file path.
    database: str = ":memory:"
    read_only: bool = False
    # Working directory used for relative paths in queries (e.g. read_csv_auto).
    working_dir: str | None = None
    max_result_rows: int = 10_000
    # Per-user uploads directory. When set, the connector reads its manifest
    # and registers a view per file so `SELECT * FROM customers` works
    # immediately after the user drops customers.csv.
    uploads_dir: str | None = None

    model_config = {"populate_by_name": True, "extra": "ignore", "frozen": True}


#: DuckDB reader function for each supported upload extension. The
#: connector picks one of these when registering a CREATE OR REPLACE
#: VIEW for an uploaded file.
_DUCKDB_READER_FOR_EXT: dict[str, str] = {
    "csv": "read_csv_auto",
    "tsv": "read_csv_auto",
    "txt": "read_csv_auto",
    "json": "read_json_auto",
    "jsonl": "read_json_auto",
    "ndjson": "read_json_auto",
    "parquet": "read_parquet",
}


class DuckDBConnector(BaseConnector):
    """Connect to an embedded DuckDB database."""

    config: DuckDBConnectionConfig

    def __init__(self, config: DuckDBConnectionConfig) -> None:
        super().__init__(config)
        self._config = config

    # ----- Connection helpers ------------------------------------------------
    def _connect(self):  # type: ignore[no-untyped-def]
        import duckdb  # type: ignore[import-not-found]

        if self._config.database in {":memory:", ""}:
            conn = duckdb.connect(database=":memory:")
        else:
            db_path = Path(self._config.database).expanduser()
            db_path.parent.mkdir(parents=True, exist_ok=True)
            conn = duckdb.connect(
                database=str(db_path),
                read_only=self._config.read_only,
            )
        if self._config.working_dir:
            try:
                wd = Path(self._config.working_dir).expanduser().resolve()
                conn.execute(f"SET file_search_path = '{wd}'")
            except Exception:
                pass
        # Register the user's uploaded files as views *before* the user's
        # query runs. Each one is `CREATE OR REPLACE VIEW <table_name> AS
        # SELECT * FROM read_<ext>('/abs/path')`. Failures per-file don't
        # abort the connect — a corrupt CSV shouldn't kill all queries.
        self._register_uploaded_views(conn)
        return conn

    def _register_uploaded_views(self, conn) -> None:  # type: ignore[no-untyped-def]
        uploads_dir = self._config.uploads_dir
        if not uploads_dir:
            return
        # Lazy-import to keep the connectors layer free of cross-package deps
        # for environments that disable uploads entirely.
        try:
            from rednotebook.uploads.store import UploadStore
        except Exception:
            return
        try:
            store = UploadStore(uploads_dir)
            files = store.list_files()
        except Exception:
            return
        for f in files:
            reader = _DUCKDB_READER_FOR_EXT.get(f.extension)
            if not reader:
                continue
            # File paths are user-scoped under uploads_dir; the table name
            # is sanitized at write time, so quoting is the only escape we
            # need here. DuckDB uses single quotes for string literals.
            safe_path = f.path.replace("'", "''")
            sql = (
                f'CREATE OR REPLACE VIEW "{f.table_name}" AS '
                f"SELECT * FROM {reader}('{safe_path}')"
            )
            try:
                conn.execute(sql)
            except Exception:
                # One bad file shouldn't break every other view. Surface
                # the error only if the user actually queries that table
                # (DuckDB will then report "table not found").
                continue

    @staticmethod
    def _columns_from_description(description) -> list[ColumnInfo]:  # type: ignore[no-untyped-def]
        return [
            ColumnInfo(
                name=str(col[0]) if col else "col",
                data_type=str(col[1]) if col and len(col) > 1 else "unknown",
                nullable=True,
            )
            for col in (description or [])
        ]

    # ----- BaseConnector implementation --------------------------------------
    def test_connection(self) -> bool:
        try:
            result = self.run_query("SELECT 1 AS ok", limit=1)
            return result.row_count == 1
        except Exception:
            return False

    def list_catalogs(self) -> list[str]:
        result = self.run_query(
            "SELECT database_name FROM duckdb_databases() ORDER BY database_name"
        )
        return [row["database_name"] for row in result.rows]

    def list_schemas(self, catalog: str) -> list[str]:
        result = self.run_query(
            "SELECT schema_name FROM information_schema.schemata "
            f"WHERE catalog_name = '{_escape(catalog)}' "
            "ORDER BY schema_name"
        )
        return [row["schema_name"] for row in result.rows]

    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]:
        result = self.run_query(
            "SELECT table_name, table_type "
            "FROM information_schema.tables "
            f"WHERE table_catalog = '{_escape(catalog)}' "
            f"AND table_schema = '{_escape(schema)}' "
            "ORDER BY table_name"
        )
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
        result = self.run_query(
            "SELECT column_name, data_type, is_nullable, column_comment "
            "FROM information_schema.columns "
            f"WHERE table_catalog = '{_escape(catalog)}' "
            f"AND table_schema = '{_escape(schema)}' "
            f"AND table_name = '{_escape(table)}' "
            "ORDER BY ordinal_position"
        )
        return [
            ColumnInfo(
                name=row["column_name"],
                data_type=row["data_type"],
                nullable=str(row.get("is_nullable", "YES")).upper() == "YES",
                comment=row.get("column_comment"),
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
        sql = (
            f'SELECT * FROM "{catalog}"."{schema}"."{table}" LIMIT {int(limit)}'
        )
        return self.run_query(sql, limit=limit)

    def supports_cancellation(self) -> bool:
        return True

    def run_query(
        self,
        sql: str,
        limit: int | None = None,
        *,
        query_id: str | None = None,
    ) -> QueryResult:
        from rednotebook.server.query_registry import get_registry

        cap = limit if limit is not None else self._config.max_result_rows
        cap = max(0, int(cap))
        started = time.monotonic()

        conn = self._connect()
        # DuckDB's interrupt() is safe to call from another thread and tells
        # the running query to stop ASAP; the original execute() then raises
        # an "Interrupted" exception, which our outer error handling treats
        # as a normal "query failed" outcome.
        if query_id:
            get_registry().register(
                query_id,
                conn.interrupt,
                label=f"duckdb:{self._config.database}",
            )
        try:
            cursor = conn.execute(sql)
            description = cursor.description
            columns = self._columns_from_description(description)
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
            return QueryResult(
                columns=columns,
                rows=rows,
                row_count=len(rows),
                duration_seconds=time.monotonic() - started,
                truncated=truncated,
                sql=sql,
            )
        finally:
            if query_id:
                get_registry().unregister(query_id)
            try:
                conn.close()
            except Exception:
                pass

    def explain_query(self, sql: str) -> QueryResult:
        return self.run_query(f"EXPLAIN {sql}")


def _escape(value: str) -> str:
    """Escape single quotes for inline SQL."""
    return value.replace("'", "''")


register_connector("duckdb", DuckDBConnector)
