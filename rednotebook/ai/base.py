"""AI provider interface and shared data shapes."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

# ``schema`` is a valid domain term for us (DataFrameSchema), but Pydantic
# v2 reserves any attribute name that shadows BaseModel's class methods
# unless you opt out. Empty ``protected_namespaces`` silences the
# UserWarning that fired on every server start.
_ALLOW_SCHEMA_FIELD = ConfigDict(protected_namespaces=())


class DataFrameSchema(BaseModel):
    """Lightweight description of a result schema for AI prompts."""

    columns: list[dict[str, str]] = Field(default_factory=list)
    row_count: int = 0

    @classmethod
    def from_query_result(cls, result: Any) -> DataFrameSchema:
        cols = [
            {"name": c.name, "data_type": c.data_type}
            for c in getattr(result, "columns", [])
        ]
        return cls(columns=cols, row_count=getattr(result, "row_count", 0))


class AIAvailableTableSchema(BaseModel):
    catalog: str | None = None
    schema_name: str | None = None
    name: str
    columns: list[dict[str, str]] = Field(default_factory=list)


class AIChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AIContext(BaseModel):
    """Context bundle passed to AI methods.

    Designed to be privacy-safe. Sample rows are only included when the
    settings allow it and PII has been masked.
    """

    catalog: str | None = None
    schema_name: str | None = None
    table: str | None = None
    schemas: list[dict[str, Any]] = Field(default_factory=list)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    aggregated_stats: dict[str, Any] | None = None
    business_terms: dict[str, str] = Field(default_factory=dict)
    available_tables: list[AIAvailableTableSchema] = Field(default_factory=list)
    history: list[AIChatTurn] = Field(default_factory=list)
    dialect: str | None = None
    mode: Literal["schema_only", "schema_and_stats", "schema_stats_samples"] = (
        "schema_and_stats"
    )


class ResultContext(BaseModel):
    """Context for summarizing a query result."""

    model_config = _ALLOW_SCHEMA_FIELD

    sql: str
    schema: DataFrameSchema
    aggregated_stats: dict[str, Any] = Field(default_factory=dict)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    notes: str | None = None


class ChartSuggestion(BaseModel):
    chart_type: str
    x: str | None = None
    y: str | list[str] | None = None
    color: str | None = None
    aggregation: str | None = None
    title: str | None = None
    reason: str | None = None


class InfographicContext(BaseModel):
    model_config = _ALLOW_SCHEMA_FIELD

    template: str = "executive_kpi_brief"
    title_hint: str | None = None
    sql: str | None = None
    schema: DataFrameSchema | None = None
    aggregated_stats: dict[str, Any] = Field(default_factory=dict)
    sample_rows: list[dict[str, Any]] = Field(default_factory=list)
    notes: str | None = None


class InfographicBrief(BaseModel):
    title: str
    summary: str
    key_metrics: list[dict[str, Any]] = Field(default_factory=list)
    insights: list[str] = Field(default_factory=list)
    recommended_charts: list[ChartSuggestion] = Field(default_factory=list)
    layout: str = "stacked"
    narrative: str = ""
    caveats: list[str] = Field(default_factory=list)


class AIProvider(ABC):
    """Provider-agnostic AI interface used by the app."""

    name: str = "abstract"

    @abstractmethod
    def generate_sql(self, prompt: str, context: AIContext) -> str: ...

    @abstractmethod
    def explain_sql(self, sql: str, context: AIContext) -> str: ...

    @abstractmethod
    def optimize_sql(self, sql: str, context: AIContext) -> str: ...

    @abstractmethod
    def suggest_chart(
        self,
        dataframe_schema: DataFrameSchema,
        sample: list[dict[str, Any]],
    ) -> ChartSuggestion: ...

    @abstractmethod
    def summarize_result(self, context: ResultContext) -> str: ...

    @abstractmethod
    def generate_infographic_brief(
        self,
        context: InfographicContext,
    ) -> InfographicBrief: ...
