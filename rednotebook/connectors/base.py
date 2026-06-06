"""Base connector interface and shared data models."""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel, Field


class ConnectionConfig(BaseModel):
    """Common connection configuration shared by all connectors."""

    connection_name: str = Field(..., min_length=1)
    connector_type: str = Field(..., min_length=1)
    description: str | None = None

    model_config = {"extra": "allow", "frozen": True}


class ColumnInfo(BaseModel):
    """Metadata about a single column."""

    name: str
    data_type: str
    nullable: bool = True
    comment: str | None = None

    model_config = {"frozen": True}


class TableInfo(BaseModel):
    """Metadata about a table or view."""

    catalog: str
    schema_name: str
    name: str
    table_type: str = "BASE TABLE"
    comment: str | None = None

    @property
    def fully_qualified(self) -> str:
        return f"{self.catalog}.{self.schema_name}.{self.name}"

    model_config = {"frozen": True}


@dataclass
class QueryResult:
    """The materialized result of a query.

    `rows` are kept as a list of dicts for portability across the app
    (UI, profiling, knowledge layer). Callers that need column-major data
    can convert via :meth:`to_dataframe`.
    """

    columns: list[ColumnInfo]
    rows: list[dict[str, Any]]
    row_count: int
    duration_seconds: float
    query_id: str | None = None
    truncated: bool = False
    sql: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dataframe(self):  # type: ignore[no-untyped-def]
        """Convert rows to a pandas DataFrame. Imported lazily."""
        import pandas as pd  # noqa: WPS433

        if not self.rows:
            return pd.DataFrame(columns=[c.name for c in self.columns])
        return pd.DataFrame(self.rows, columns=[c.name for c in self.columns])


class BaseConnector(ABC):
    """Abstract connector interface, every connector must implement this."""

    config: ConnectionConfig

    def __init__(self, config: ConnectionConfig) -> None:
        self.config = config

    @property
    def name(self) -> str:
        return self.config.connection_name

    @abstractmethod
    def test_connection(self) -> bool:
        """Return True if a trivial query succeeds against the source."""

    @abstractmethod
    def list_catalogs(self) -> list[str]:
        """List visible catalogs."""

    @abstractmethod
    def list_schemas(self, catalog: str) -> list[str]:
        """List schemas in a catalog."""

    @abstractmethod
    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]:
        """List tables and views in a schema."""

    @abstractmethod
    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]:
        """List columns of a table."""

    @abstractmethod
    def preview_table(
        self,
        catalog: str,
        schema: str,
        table: str,
        limit: int = 100,
    ) -> QueryResult:
        """Return a small sample of rows from a table."""

    @abstractmethod
    def run_query(self, sql: str, limit: int | None = None) -> QueryResult:
        """Execute a SQL query and return its result."""

    @abstractmethod
    def explain_query(self, sql: str) -> QueryResult:
        """Return EXPLAIN output for a SQL query."""

    def cancel_query(self, query_id: str) -> bool:  # pragma: no cover - default stub
        """Cancel a running query. Default implementation is a no-op."""
        return False
