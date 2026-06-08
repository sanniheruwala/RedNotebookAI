"""Pydantic request/response schemas for the HTTP API."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

from rednotebook.ai.base import ChartSuggestion, InfographicBrief
from rednotebook.connectors.base import ColumnInfo
from rednotebook.knowledge.models import KnowledgeNotebook, KnowledgeSource
from rednotebook.notebook.models import ChartConfig, Notebook


# ----- Connections -----------------------------------------------------------
class TrinoConnectionPayload(BaseModel):
    """Trino-specific connection fields (HTTPS-style cluster connection)."""

    connector_type: Literal["trino"] = "trino"
    connection_name: str = "default"
    host: str
    port: int = 443
    scheme: str = "https"
    user: str
    password: str | None = None
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

    model_config = {"populate_by_name": True}


class DuckDBConnectionPayload(BaseModel):
    """DuckDB embedded connection (in-memory or local file)."""

    connector_type: Literal["duckdb"] = "duckdb"
    connection_name: str = "default"
    database: str = ":memory:"
    read_only: bool = False
    working_dir: str | None = None
    max_result_rows: int = 10_000

    model_config = {"populate_by_name": True}


class _SQLAlchemyBasePayload(BaseModel):
    """Common shape for SQLAlchemy-backed connector payloads.

    Subclasses pin ``connector_type``; the dispatcher in
    :mod:`rednotebook.server.dependencies` routes them to the matching
    config + connector class. Fields a given dialect doesn't use (e.g.
    ``host`` for SQLite) are simply ignored downstream.
    """

    connection_name: str = "default"
    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    password: str | None = None
    schema_name: str | None = Field(default=None, alias="schema")
    query_timeout_seconds: int = 300
    max_result_rows: int = 10_000
    connect_args: dict[str, Any] = Field(default_factory=dict)
    url_params: dict[str, str] = Field(default_factory=dict)

    model_config = {"populate_by_name": True}


class PostgreSQLConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["postgresql"] = "postgresql"
    port: int = 5432
    database: str = "postgres"


class MySQLConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["mysql"] = "mysql"
    port: int = 3306


class MariaDBConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["mariadb"] = "mariadb"
    port: int = 3306


class SQLiteConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["sqlite"] = "sqlite"
    database: str = ":memory:"


class MSSQLConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["mssql"] = "mssql"
    port: int = 1433
    odbc_driver: str = "ODBC Driver 18 for SQL Server"


class SnowflakeConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["snowflake"] = "snowflake"
    account: str = ""
    warehouse: str | None = None
    role: str | None = None


class BigQueryConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["bigquery"] = "bigquery"
    project: str = ""
    credentials_path: str | None = None


class RedshiftConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["redshift"] = "redshift"
    port: int = 5439


class OracleConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["oracle"] = "oracle"
    port: int = 1521
    service_name: str | None = None


class ClickHouseConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["clickhouse"] = "clickhouse"
    port: int = 8123
    secure: bool = False


class DatabricksConnectionPayload(_SQLAlchemyBasePayload):
    connector_type: Literal["databricks"] = "databricks"
    http_path: str = ""
    access_token: str = ""
    catalog: str | None = None


# Discriminated union: the connector_type field tells pydantic which payload
# shape to validate against. Routes that take a "connection" should use this
# type so they accept every connector transparently.
ConnectionPayload = (
    TrinoConnectionPayload
    | DuckDBConnectionPayload
    | PostgreSQLConnectionPayload
    | MySQLConnectionPayload
    | MariaDBConnectionPayload
    | SQLiteConnectionPayload
    | MSSQLConnectionPayload
    | SnowflakeConnectionPayload
    | BigQueryConnectionPayload
    | RedshiftConnectionPayload
    | OracleConnectionPayload
    | ClickHouseConnectionPayload
    | DatabricksConnectionPayload
)


class TestConnectionResponse(BaseModel):
    ok: bool
    message: str
    duration_seconds: float | None = None


# ----- Metadata --------------------------------------------------------------
class CatalogListResponse(BaseModel):
    catalogs: list[str]


class SchemaListResponse(BaseModel):
    schemas: list[str]


class TableListItem(BaseModel):
    catalog: str
    schema_name: str
    name: str
    table_type: str


class TableListResponse(BaseModel):
    tables: list[TableListItem]


class ColumnListResponse(BaseModel):
    columns: list[ColumnInfo]


# ----- Query -----------------------------------------------------------------
class RunQueryRequest(BaseModel):
    connection: ConnectionPayload = Field(discriminator="connector_type")
    sql: str
    limit: int | None = None
    confirm_write: bool = False


class GuardInfo(BaseModel):
    verdict: Literal["allowed", "warn", "blocked"]
    reasons: list[str] = Field(default_factory=list)
    dangerous_keywords: list[str] = Field(default_factory=list)
    statement_type: str | None = None


class QueryResultPayload(BaseModel):
    columns: list[ColumnInfo]
    rows: list[dict[str, Any]]
    row_count: int
    duration_seconds: float
    truncated: bool
    query_id: str | None = None
    sql: str | None = None


class RunQueryResponse(BaseModel):
    ok: bool
    guard: GuardInfo
    result: QueryResultPayload | None = None
    error: str | None = None


class ExplainQueryRequest(BaseModel):
    connection: ConnectionPayload = Field(discriminator="connector_type")
    sql: str


# ----- AI --------------------------------------------------------------------
class AIAvailableTable(BaseModel):
    """A table the user could reasonably reference in a prompt."""

    catalog: str | None = None
    schema_name: str | None = None
    name: str
    columns: list[ColumnInfo] = Field(default_factory=list)


class AIChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AIContextPayload(BaseModel):
    catalog: str | None = None
    schema_name: str | None = None
    table: str | None = None
    columns: list[ColumnInfo] = Field(default_factory=list)
    business_terms: dict[str, str] = Field(default_factory=dict)
    aggregated_stats: dict[str, Any] | None = None
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    # Tables the user can reference in this conversation. Populated by the
    # frontend from the active connection's metadata so the model can pick
    # the right one instead of hallucinating identifiers.
    available_tables: list[AIAvailableTable] = Field(default_factory=list)
    # Prior turns in this Ask-AI cell, oldest first. Lets the model thread
    # follow-ups (especially after a clarifying question).
    history: list[AIChatTurn] = Field(default_factory=list)
    dialect: str | None = None


class AIGenerateSQLRequest(BaseModel):
    prompt: str
    context: AIContextPayload = Field(default_factory=AIContextPayload)


class AIGenerateSQLResponse(BaseModel):
    """Either ``sql`` or ``clarification`` is populated, never both.

    The generator returns a clarifying question instead of SQL when the
    prompt is ambiguous (e.g. multiple tables match "customers"). The
    frontend renders this as an assistant question bubble and resends the
    user's reply with conversation history attached.
    """

    sql: str = ""
    provider: str
    clarification: str | None = None


class AIExplainSQLRequest(BaseModel):
    sql: str
    context: AIContextPayload = Field(default_factory=AIContextPayload)


class AIOptimizeSQLRequest(BaseModel):
    sql: str
    context: AIContextPayload = Field(default_factory=AIContextPayload)


class AITextResponse(BaseModel):
    text: str
    provider: str


class AIExplainResultRequest(BaseModel):
    sql: str
    columns: list[ColumnInfo]
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    row_count: int = 0
    aggregated_stats: dict[str, Any] = Field(default_factory=dict)


# ----- Charts ----------------------------------------------------------------
class ChartSuggestRequest(BaseModel):
    columns: list[ColumnInfo]
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    row_count: int = 0


class ChartSuggestResponse(BaseModel):
    suggestion: ChartSuggestion


class ChartBuildRequest(BaseModel):
    chart_config: ChartConfig
    columns: list[ColumnInfo]
    rows: list[dict[str, Any]] = Field(default_factory=list)
    row_count: int = 0
    truncated: bool = False


class ChartBuildResponse(BaseModel):
    spec: dict[str, Any]


# ----- Knowledge -------------------------------------------------------------
class CreateNotebookRequest(BaseModel):
    name: str
    description: str | None = None


class KnowledgeNotebookListResponse(BaseModel):
    notebooks: list[KnowledgeNotebook]


class KnowledgeSourceListResponse(BaseModel):
    sources: list[KnowledgeSource]


class KnowledgeChatRequest(BaseModel):
    notebook_id: str
    question: str
    source_ids: list[str] = Field(default_factory=list)


class KnowledgeChatResponse(BaseModel):
    answer: str
    provider: str
    cited_source_ids: list[str] = Field(default_factory=list)


class AddSourceRequest(BaseModel):
    notebook_id: str
    source_type: Literal[
        "sql_query",
        "query_result",
        "chart",
        "markdown",
        "schema",
        "profile",
        "uploaded_file",
        "web_link",
        "business_definition",
    ]
    title: str
    content: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


# ----- Infographics ----------------------------------------------------------
class InfographicGenerateRequest(BaseModel):
    notebook_id: str | None = None
    template: str = "executive_kpi_brief"
    title_hint: str | None = None
    sql: str | None = None
    columns: list[ColumnInfo] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    aggregated_stats: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    persist: bool = False


class InfographicGenerateResponse(BaseModel):
    brief: InfographicBrief
    html: str
    export_path: str | None = None


# ----- Notebooks -------------------------------------------------------------
class NotebookListItem(BaseModel):
    id: str
    title: str
    path: str


class NotebookListResponse(BaseModel):
    notebooks: list[NotebookListItem]


class CreateNotebookFileRequest(BaseModel):
    title: str = "Untitled Notebook"


class NotebookResponse(BaseModel):
    notebook: Notebook


class SaveNotebookResponse(BaseModel):
    ok: bool
    notebook_id: str
    path: str
