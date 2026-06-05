"""Connector plugin registry."""

from __future__ import annotations

from rednotebook.connectors.base import BaseConnector

_REGISTRY: dict[str, type[BaseConnector]] = {}


def register_connector(name: str, connector_class: type[BaseConnector]) -> None:
    """Register a connector implementation under a short name."""
    if not name:
        raise ValueError("Connector name must be non-empty")
    _REGISTRY[name.lower()] = connector_class


def get_connector_class(name: str) -> type[BaseConnector]:
    """Return a registered connector class by name."""
    key = name.lower()
    if key not in _REGISTRY:
        raise KeyError(
            f"Unknown connector '{name}'. Available: {sorted(_REGISTRY)}"
        )
    return _REGISTRY[key]


def available_connectors() -> list[str]:
    """Return the names of all registered connectors."""
    return sorted(_REGISTRY)
