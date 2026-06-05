"""Connector plugin layer."""

from rednotebook.connectors.base import (
    BaseConnector,
    ColumnInfo,
    ConnectionConfig,
    QueryResult,
    TableInfo,
)
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
    "QueryResult",
    "TableInfo",
    "TrinoConnectionConfig",
    "TrinoConnector",
    "available_connectors",
    "get_connector_class",
    "register_connector",
]
