"""SQLAlchemy-backed connectors for 11 mainstream databases.

One module hosts every dialect so the registry has a single import surface
and the API schema has a single source of truth. Each connector inherits
``SQLAlchemyConnector`` and provides only:

  * a ``connector_type`` literal so the discriminated payload union routes
    requests to the right class,
  * a default port,
  * a ``_build_url`` that maps its config to a SQLAlchemy URL.

Python drivers are bundled in the base ``rednotebook-ai`` distribution and
imported *lazily* by SQLAlchemy inside ``create_engine``. If the bundled
driver is somehow missing — e.g. a corrupted install — the connector
raises a clear runtime error instead of crashing on import at startup.
"""

from __future__ import annotations

import time
from typing import Any
from urllib.parse import quote_plus

from pydantic import Field

from rednotebook.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    TableInfo,
)
from rednotebook.connectors.registry import register_connector


# ---------------------------------------------------------------------------
# Shared config + connector base
# ---------------------------------------------------------------------------
class SQLAlchemyConnectionConfig(ConnectionConfig):
    """Base shape for any SQLAlchemy-backed config.

    Subclasses override ``connector_type`` + default port. Fields not used
    by a given dialect (e.g. ``host`` for SQLite) are simply ignored.
    """

    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    password: str | None = None
    schema_name: str | None = Field(default=None, alias="schema")
    query_timeout_seconds: int = 300
    max_result_rows: int = 10_000
    # Free-form k/v handed to SQLAlchemy create_engine as connect_args.
    connect_args: dict[str, Any] = Field(default_factory=dict)
    # Free-form k/v appended as URL query params (?ssl=...).
    url_params: dict[str, str] = Field(default_factory=dict)

    model_config = {
        "populate_by_name": True,
        "extra": "ignore",
        "frozen": True,
    }


class SQLAlchemyConnector(BaseConnector):
    """Generic connector that drives any SQLAlchemy dialect."""

    config: SQLAlchemyConnectionConfig
    #: SQLAlchemy dialect+driver string, e.g. "postgresql+psycopg".
    dialect_driver: str = ""
    #: When True, only the database name matters (SQLite-like).
    file_based: bool = False

    def __init__(self, config: SQLAlchemyConnectionConfig) -> None:
        super().__init__(config)
        self._engine: Any = None

    # ----- URL building -----------------------------------------------------
    def _build_url(self) -> str:
        c = self.config
        if self.file_based:
            return f"{self.dialect_driver}:///{c.database}"
        auth = ""
        if c.username:
            auth = c.username
            if c.password:
                auth += f":{quote_plus(c.password)}"
            auth += "@"
        netloc = f"{c.host}:{c.port}" if c.port else c.host
        url = f"{self.dialect_driver}://{auth}{netloc}/{c.database}"
        if c.url_params:
            from urllib.parse import urlencode
            url += "?" + urlencode(c.url_params)
        return url

    # ----- Engine -----------------------------------------------------------
    def _engine_or_raise(self):  # type: ignore[no-untyped-def]
        import sqlalchemy as sa
        from sqlalchemy.exc import NoSuchModuleError

        if self._engine is None:
            try:
                self._engine = sa.create_engine(
                    self._build_url(),
                    connect_args=self.config.connect_args or {},
                    pool_pre_ping=True,
                )
            except (ModuleNotFoundError, NoSuchModuleError) as exc:
                # Drivers are bundled with rednotebook-ai, so reaching this
                # branch means the install itself is broken (corrupted
                # wheel, partial site-packages, mismatched Python version).
                raise RuntimeError(
                    f"Bundled driver for '{self.dialect_driver}' could not be "
                    f"loaded. The rednotebook-ai install appears to be "
                    f"incomplete — try reinstalling. Underlying error: {exc}"
                ) from exc
        return self._engine

    # ----- Core interface ---------------------------------------------------
    def test_connection(self) -> bool:
        import sqlalchemy as sa

        engine = self._engine_or_raise()
        with engine.connect() as conn:
            conn.execute(sa.text("SELECT 1"))
        return True

    def list_catalogs(self) -> list[str]:
        # Most SQLAlchemy dialects don't expose a catalog list separately;
        # the connection-bound database name acts as the only "catalog".
        return [self.config.database or self.dialect_driver.split("+")[0]]

    def list_schemas(self, catalog: str) -> list[str]:
        import sqlalchemy as sa

        engine = self._engine_or_raise()
        insp = sa.inspect(engine)
        return sorted(insp.get_schema_names())

    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]:
        import sqlalchemy as sa

        engine = self._engine_or_raise()
        insp = sa.inspect(engine)
        tables: list[TableInfo] = []
        schema_label = schema or ""
        for name in insp.get_table_names(schema=schema or None):
            tables.append(
                TableInfo(
                    catalog=catalog,
                    schema_name=schema_label,
                    name=name,
                    table_type="BASE TABLE",
                )
            )
        for name in insp.get_view_names(schema=schema or None):
            tables.append(
                TableInfo(
                    catalog=catalog,
                    schema_name=schema_label,
                    name=name,
                    table_type="VIEW",
                )
            )
        return tables

    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]:
        import sqlalchemy as sa

        engine = self._engine_or_raise()
        insp = sa.inspect(engine)
        cols: list[ColumnInfo] = []
        for c in insp.get_columns(table, schema=schema or None):
            cols.append(
                ColumnInfo(
                    name=str(c["name"]),
                    data_type=str(c.get("type", "")),
                    nullable=bool(c.get("nullable", True)),
                    comment=c.get("comment"),
                )
            )
        return cols

    def preview_table(
        self, catalog: str, schema: str, table: str, limit: int = 100
    ) -> QueryResult:
        ident = f'"{schema}"."{table}"' if schema else f'"{table}"'
        return self.run_query(f"SELECT * FROM {ident}", limit=limit)

    def run_query(self, sql: str, limit: int | None = None) -> QueryResult:
        import sqlalchemy as sa

        cap = limit if limit is not None else self.config.max_result_rows
        started = time.monotonic()
        engine = self._engine_or_raise()
        columns: list[ColumnInfo] = []
        rows: list[dict[str, Any]] = []
        truncated = False
        with engine.connect() as conn:
            cursor = conn.execute(sa.text(sql))
            # DDL/DML (CREATE, INSERT, UPDATE, …) returns no rows. Commit and
            # short-circuit instead of asking the result for cursor metadata.
            if cursor.returns_rows:
                description = cursor.cursor.description if cursor.cursor else None
                columns = [
                    ColumnInfo(name=str(d[0]), data_type="", nullable=True)
                    for d in (description or [])
                ]
                rows_raw = cursor.fetchmany(cap + 1) if cap else cursor.fetchall()
                truncated = bool(cap) and len(rows_raw) > cap
                if truncated:
                    rows_raw = rows_raw[:cap]
                rows = [
                    {col.name: _coerce(row[i]) for i, col in enumerate(columns)}
                    for row in rows_raw
                ]
            else:
                conn.commit()
        elapsed = time.monotonic() - started
        return QueryResult(
            columns=columns,
            rows=rows,
            row_count=len(rows),
            duration_seconds=elapsed,
            truncated=truncated,
            sql=sql,
        )

    def explain_query(self, sql: str) -> QueryResult:
        # EXPLAIN syntax varies by dialect, so just prefix and run.
        return self.run_query(f"EXPLAIN {sql}")


def _coerce(value: Any) -> Any:
    """Cheap JSON-friendliness pass for SQLAlchemy row values."""
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


# ---------------------------------------------------------------------------
# Per-dialect configs + connectors. Each subclass pins the dialect_driver
# string, the default port, and (rarely) overrides URL building.
# ---------------------------------------------------------------------------
class PostgreSQLConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="postgresql", frozen=True)
    port: int = 5432
    database: str = "postgres"


class PostgreSQLConnector(SQLAlchemyConnector):
    config: PostgreSQLConnectionConfig
    dialect_driver = "postgresql+psycopg"


class MySQLConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="mysql", frozen=True)
    port: int = 3306


class MySQLConnector(SQLAlchemyConnector):
    config: MySQLConnectionConfig
    dialect_driver = "mysql+pymysql"


class MariaDBConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="mariadb", frozen=True)
    port: int = 3306


class MariaDBConnector(SQLAlchemyConnector):
    config: MariaDBConnectionConfig
    dialect_driver = "mariadb+pymysql"


class SQLiteConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="sqlite", frozen=True)
    database: str = ":memory:"


class SQLiteConnector(SQLAlchemyConnector):
    config: SQLiteConnectionConfig
    dialect_driver = "sqlite"
    file_based = True


class MSSQLConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="mssql", frozen=True)
    port: int = 1433
    odbc_driver: str = "ODBC Driver 18 for SQL Server"


class MSSQLConnector(SQLAlchemyConnector):
    config: MSSQLConnectionConfig
    dialect_driver = "mssql+pyodbc"

    def _build_url(self) -> str:
        c: MSSQLConnectionConfig = self.config  # type: ignore[assignment]
        base = super()._build_url()
        sep = "&" if "?" in base else "?"
        return f"{base}{sep}driver={quote_plus(c.odbc_driver)}"


class SnowflakeConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="snowflake", frozen=True)
    account: str = ""
    warehouse: str | None = None
    role: str | None = None


class SnowflakeConnector(SQLAlchemyConnector):
    config: SnowflakeConnectionConfig
    dialect_driver = "snowflake"

    def _build_url(self) -> str:
        c: SnowflakeConnectionConfig = self.config  # type: ignore[assignment]
        from urllib.parse import urlencode

        auth = quote_plus(c.username)
        if c.password:
            auth += f":{quote_plus(c.password)}"
        url = f"snowflake://{auth}@{c.account}/{c.database}"
        if c.schema_name:
            url += f"/{c.schema_name}"
        params: dict[str, str] = {}
        if c.warehouse:
            params["warehouse"] = c.warehouse
        if c.role:
            params["role"] = c.role
        params.update(c.url_params)
        if params:
            url += "?" + urlencode(params)
        return url


class BigQueryConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="bigquery", frozen=True)
    project: str = ""
    credentials_path: str | None = None


class BigQueryConnector(SQLAlchemyConnector):
    config: BigQueryConnectionConfig
    dialect_driver = "bigquery"

    def _build_url(self) -> str:
        c: BigQueryConnectionConfig = self.config  # type: ignore[assignment]
        url = f"bigquery://{c.project}"
        if c.database:  # in BigQuery the "database" slot holds the dataset
            url += f"/{c.database}"
        if c.credentials_path:
            from urllib.parse import urlencode
            url += "?" + urlencode({"credentials_path": c.credentials_path})
        return url


class RedshiftConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="redshift", frozen=True)
    port: int = 5439


class RedshiftConnector(SQLAlchemyConnector):
    config: RedshiftConnectionConfig
    dialect_driver = "redshift+redshift_connector"


class OracleConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="oracle", frozen=True)
    port: int = 1521
    service_name: str | None = None


class OracleConnector(SQLAlchemyConnector):
    config: OracleConnectionConfig
    dialect_driver = "oracle+oracledb"

    def _build_url(self) -> str:
        c: OracleConnectionConfig = self.config  # type: ignore[assignment]
        if c.service_name:
            from urllib.parse import urlencode
            base = super()._build_url().split("?")[0]
            return base + "?" + urlencode({"service_name": c.service_name})
        return super()._build_url()


class ClickHouseConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="clickhouse", frozen=True)
    port: int = 8123  # HTTP interface (native is 9000)
    secure: bool = False


class ClickHouseConnector(SQLAlchemyConnector):
    config: ClickHouseConnectionConfig

    @property
    def dialect_driver(self) -> str:  # type: ignore[override]
        return "clickhouse+http"

    def _build_url(self) -> str:
        c: ClickHouseConnectionConfig = self.config  # type: ignore[assignment]
        base = super()._build_url()
        if c.secure:
            sep = "&" if "?" in base else "?"
            return f"{base}{sep}protocol=https"
        return base


class DatabricksConnectionConfig(SQLAlchemyConnectionConfig):
    connector_type: str = Field(default="databricks", frozen=True)
    http_path: str = ""
    access_token: str = ""
    catalog: str | None = None


class DatabricksConnector(SQLAlchemyConnector):
    config: DatabricksConnectionConfig
    dialect_driver = "databricks"

    def _build_url(self) -> str:
        c: DatabricksConnectionConfig = self.config  # type: ignore[assignment]
        from urllib.parse import urlencode
        url = f"databricks://token:{quote_plus(c.access_token)}@{c.host}"
        if c.database:
            url += f"/{c.database}"
        if c.schema_name:
            url += f"/{c.schema_name}"
        params: dict[str, str] = {"http_path": c.http_path}
        if c.catalog:
            params["catalog"] = c.catalog
        params.update(c.url_params)
        url += "?" + urlencode(params)
        return url


# ---------------------------------------------------------------------------
# Registry — register every dialect by short name.
# ---------------------------------------------------------------------------
register_connector("postgresql", PostgreSQLConnector)
register_connector("mysql", MySQLConnector)
register_connector("mariadb", MariaDBConnector)
register_connector("sqlite", SQLiteConnector)
register_connector("mssql", MSSQLConnector)
register_connector("snowflake", SnowflakeConnector)
register_connector("bigquery", BigQueryConnector)
register_connector("redshift", RedshiftConnector)
register_connector("oracle", OracleConnector)
register_connector("clickhouse", ClickHouseConnector)
register_connector("databricks", DatabricksConnector)


CONFIG_BY_CONNECTOR: dict[str, type[SQLAlchemyConnectionConfig]] = {
    "postgresql": PostgreSQLConnectionConfig,
    "mysql": MySQLConnectionConfig,
    "mariadb": MariaDBConnectionConfig,
    "sqlite": SQLiteConnectionConfig,
    "mssql": MSSQLConnectionConfig,
    "snowflake": SnowflakeConnectionConfig,
    "bigquery": BigQueryConnectionConfig,
    "redshift": RedshiftConnectionConfig,
    "oracle": OracleConnectionConfig,
    "clickhouse": ClickHouseConnectionConfig,
    "databricks": DatabricksConnectionConfig,
}

CONNECTOR_BY_TYPE: dict[str, type[SQLAlchemyConnector]] = {
    "postgresql": PostgreSQLConnector,
    "mysql": MySQLConnector,
    "mariadb": MariaDBConnector,
    "sqlite": SQLiteConnector,
    "mssql": MSSQLConnector,
    "snowflake": SnowflakeConnector,
    "bigquery": BigQueryConnector,
    "redshift": RedshiftConnector,
    "oracle": OracleConnector,
    "clickhouse": ClickHouseConnector,
    "databricks": DatabricksConnector,
}
