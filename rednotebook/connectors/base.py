"""Base connector interface and shared data models."""

from __future__ import annotations

import datetime as _dt
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from uuid import UUID

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
    def run_query(
        self,
        sql: str,
        limit: int | None = None,
        *,
        query_id: str | None = None,
    ) -> QueryResult:
        """Execute a SQL query and return its result.

        ``query_id`` is the client-minted token used to address this
        execution from the cancel endpoint. Connectors that support
        cancellation register a per-engine kill hook against this id
        for the duration of the call.
        """

    @abstractmethod
    def explain_query(self, sql: str) -> QueryResult:
        """Return EXPLAIN output for a SQL query."""

    def supports_cancellation(self) -> bool:
        """Whether this connector can kill an in-flight query at the engine.

        Default False; subclasses that wire up the cancel registry flip
        this to True so the UI can stop pretending a Stop click reaches
        the engine when it doesn't.
        """
        return False


def coerce_row_value(value: Any) -> Any:
    """Make a raw DB-API value JSON-friendly for the response payload.

    Pydantic v2's JSON serializer accepts strings, numbers, bools, and None
    natively, but raises a confusing ``SchemaSerializer`` error when it
    encounters a type it can't introspect (e.g. ``decimal.Decimal``,
    ``datetime``, ``UUID``, ``bytes``, vendor row objects). That message
    masks the actual query — particularly painful for ``IS NULL`` style
    queries where the user assumes the syntax is wrong.

    Cheap, lossless-where-possible coercion: keep primitives as-is,
    stringify everything else.
    """
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        # Python booleans are ints, but isinstance check above keeps them.
        return value
    if isinstance(value, Decimal):
        # int when exact, float otherwise — preserves Pydantic's number
        # serialization path without losing significant digits for IDs.
        if value == value.to_integral_value():
            try:
                return int(value)
            except (OverflowError, ValueError):
                return str(value)
        return float(value)
    if isinstance(value, (_dt.datetime, _dt.date, _dt.time)):
        return value.isoformat()
    if isinstance(value, _dt.timedelta):
        return value.total_seconds()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (bytes, bytearray, memoryview)):
        try:
            return bytes(value).decode("utf-8")
        except UnicodeDecodeError:
            return bytes(value).hex()
    if isinstance(value, (list, tuple, set, frozenset)):
        return [coerce_row_value(v) for v in value]
    if isinstance(value, dict):
        return {str(k): coerce_row_value(v) for k, v in value.items()}
    return str(value)
