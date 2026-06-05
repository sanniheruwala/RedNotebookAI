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
    connection: TrinoConnectionPayload
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
    connection: TrinoConnectionPayload
    sql: str


# ----- AI --------------------------------------------------------------------
class AIContextPayload(BaseModel):
    catalog: str | None = None
    schema_name: str | None = None
    table: str | None = None
    columns: list[ColumnInfo] = Field(default_factory=list)
    business_terms: dict[str, str] = Field(default_factory=dict)
    aggregated_stats: dict[str, Any] | None = None
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)


class AIGenerateSQLRequest(BaseModel):
    prompt: str
    context: AIContextPayload = Field(default_factory=AIContextPayload)


class AIGenerateSQLResponse(BaseModel):
    sql: str
    provider: str


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
