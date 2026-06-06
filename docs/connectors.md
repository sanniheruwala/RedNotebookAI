# Connectors

RedNotebook AI ships with **13 built-in connectors**, all driven by the
same `BaseConnector` interface so the notebook UI, AI context builder,
SQL guard, and result profiler treat every data source identically.

| Connector       | Driver / library                              | Default port | Notes                                                  |
|-----------------|-----------------------------------------------|--------------|--------------------------------------------------------|
| Trino           | `trino-python-client`                         | 443 (HTTPS)  | First-class. HTTP headers + session properties + TLS.  |
| DuckDB          | `duckdb` (embedded)                           | n/a          | In-memory or file. No external server.                 |
| PostgreSQL      | SQLAlchemy + `psycopg[binary]`                | 5432         |                                                        |
| MySQL           | SQLAlchemy + `pymysql`                        | 3306         |                                                        |
| MariaDB         | SQLAlchemy + `pymysql`                        | 3306         | Same driver as MySQL, different dialect.               |
| SQLite          | SQLAlchemy + stdlib `sqlite3`                 | n/a          | File-based; `database` is the file path.               |
| MSSQL           | SQLAlchemy + `pyodbc` + `msodbcsql18`         | 1433         | ODBC driver is bundled in the Docker image.            |
| Snowflake       | `snowflake-sqlalchemy`                        | n/a          | Uses account + warehouse + role instead of host/port.  |
| BigQuery        | `sqlalchemy-bigquery`                         | n/a          | `project` is required; `database` slot = dataset.      |
| Redshift        | `sqlalchemy-redshift` + `redshift-connector`  | 5439         |                                                        |
| Oracle          | `oracledb` (thin mode)                        | 1521         | Supports `service_name`.                               |
| ClickHouse      | `clickhouse-sqlalchemy` (HTTP)                | 8123         | Set `secure=true` to use HTTPS.                        |
| Databricks SQL  | `databricks-sqlalchemy`                       | n/a          | Needs `http_path`, `access_token`, optional `catalog`. |

**No `pip install …[extras]` step required.** Every driver above is
pulled in by the base `rednotebook-ai` package. The Docker image also
installs `unixodbc` + Microsoft's `msodbcsql18` so MSSQL works out of
the box on both `amd64` and `arm64`.

## `BaseConnector` interface

Every connector implements `rednotebook.connectors.base.BaseConnector`:

```python
class BaseConnector:
    def test_connection(self) -> bool: ...
    def list_catalogs(self) -> list[str]: ...
    def list_schemas(self, catalog: str) -> list[str]: ...
    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]: ...
    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]: ...
    def preview_table(self, catalog, schema, table, limit: int = 100) -> QueryResult: ...
    def run_query(self, sql: str, limit: int | None = None) -> QueryResult: ...
    def explain_query(self, sql: str) -> QueryResult: ...
    def cancel_query(self, query_id: str) -> bool: ...
```

Connectors return strongly-typed `ColumnInfo`, `TableInfo`, and `QueryResult`
records so the rest of the app stays decoupled from connector internals.

## Trino HTTPS connector

`rednotebook.connectors.trino.TrinoConnector` wraps the official `trino`
Python client. Supported inputs:

- `host`, `port`, `scheme`, `user`, `password` (SecretStr)
- `catalog`, `schema`
- `http_headers`, `session_properties`
- `verify_ssl`, `ca_certificate_path`
- `source`, `timezone`
- `query_timeout_seconds`, `max_preview_rows`, `max_result_rows`

Query cancellation is a stub — the official client does not expose a
portable cancel API. The HTTP layer surfaces this clearly.

## DuckDB connector

`rednotebook.connectors.duckdb.DuckDBConnector` embeds DuckDB in-process.
No external server required, which makes it the friendliest "try the app
without standing up a warehouse" path.

Supported inputs:

- `database` — `":memory:"` for an ephemeral playground, or a path to a
  `.duckdb` file for persistent state
- `read_only` — open the file as read-only
- `working_dir` — sets `file_search_path` so relative file paths in
  `read_csv_auto` / `read_parquet` resolve from this directory
- `max_result_rows`

Catalogs come from `duckdb_databases()` (the default file's basename
becomes the catalog name). Schemas / tables / columns are introspected
via `information_schema`, matching the Trino connector's shape.

## SQLAlchemy-backed connectors

All eleven SQLAlchemy connectors live in
`rednotebook/connectors/sqlalchemy_dialects.py` and share a single
`SQLAlchemyConnector` base. Each subclass only pins:

- `connector_type` (literal used by the discriminated-union payload),
- the default port,
- the SQLAlchemy `dialect_driver` (e.g. `postgresql+psycopg`),
- a `_build_url(...)` override when the URL shape differs from the
  generic `dialect://user:pass@host:port/db?…` template.

Shared fields on every payload (see `SQLAlchemyConnectionConfig`):
`host`, `port`, `database`, `username`, `password`, `schema_name`,
`query_timeout_seconds`, `max_result_rows`, plus two escape hatches:

- `connect_args: dict` → handed straight to `sqlalchemy.create_engine`.
- `url_params: dict` → URL-encoded onto the connection string as
  `?key=value`. Useful for `ssl=…`, region overrides, etc.

### Connector-specific extras

| Connector  | Extra fields                                                   |
|------------|----------------------------------------------------------------|
| MSSQL      | `odbc_driver` (defaults to `ODBC Driver 18 for SQL Server`).    |
| Snowflake  | `account`, `warehouse`, `role`.                                |
| BigQuery   | `project`, `credentials_path` (path to service-account JSON).  |
| Oracle     | `service_name` (preferred over SID).                           |
| ClickHouse | `secure` (toggles HTTPS).                                      |
| Databricks | `http_path`, `access_token`, optional `catalog`.               |

## Adding a new connector

Drop a new class into `rednotebook/connectors/`, implement
`BaseConnector`, and register it:

```python
from rednotebook.connectors.base import BaseConnector, ConnectionConfig
from rednotebook.connectors.registry import register_connector

class MyConnector(BaseConnector):
    def test_connection(self) -> bool: ...
    # ... other interface methods

register_connector("mydb", MyConnector)
```

If the new source is just another SQLAlchemy dialect, prefer subclassing
`SQLAlchemyConnector` in `sqlalchemy_dialects.py` and registering it
alongside the existing ones — that keeps the API schema, the saved-
connections store, and the UI picker in sync automatically.

Then update the UI's connection dialog to accept your fields.
