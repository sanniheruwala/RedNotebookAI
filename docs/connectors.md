# Connectors

## BaseConnector interface

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

Query cancellation is a stub, the official client does not expose a portable
cancel API. The HTTP layer surfaces this clearly.

## Adding a new connector

```python
from rednotebook.connectors.base import BaseConnector, ConnectionConfig
from rednotebook.connectors.registry import register_connector

class PostgresConnector(BaseConnector):
    def test_connection(self) -> bool: ...

register_connector("postgres", PostgresConnector)
```

Then update the UI's connection dialog to accept your fields.

## Planned connectors

PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, Athena, Databricks SQL,
DuckDB, ClickHouse, CSV/Excel uploads, Google Sheets.
