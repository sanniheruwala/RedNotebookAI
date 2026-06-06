"""Connector plugin layer."""

# Importing the dialects module registers all 11 SQLAlchemy-backed
# connectors with the global registry. Side-effect-only import.
from rednotebook.connectors import sqlalchemy_dialects as _sqlalchemy_dialects  # noqa: F401
from rednotebook.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    TableInfo,
)
from rednotebook.connectors.duckdb import DuckDBConnectionConfig, DuckDBConnector
from rednotebook.connectors.registry import (
    available_connectors,
    get_connector_class,
    register_connector,
)
from rednotebook.connectors.trino import TrinoConnectionConfig, TrinoConnector

__all__ = [
    "BaseConnector",
    "ColumnInfo",
    "ConnectionConfig",
    "DuckDBConnectionConfig",
    "DuckDBConnector",
    "QueryResult",
    "TableInfo",
    "TrinoConnectionConfig",
    "TrinoConnector",
    "available_connectors",
    "get_connector_class",
    "register_connector",
]
