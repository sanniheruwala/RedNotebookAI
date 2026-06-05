"""FastAPI dependency helpers."""

from __future__ import annotations

from pydantic import SecretStr

from rednotebook.config.settings import Settings, get_settings
from rednotebook.connectors.trino import TrinoConnectionConfig, TrinoConnector
from rednotebook.knowledge.internal_provider import get_internal_store
from rednotebook.knowledge.store import InternalKnowledgeStore
from rednotebook.notebook.storage import NotebookStorage
from rednotebook.server.schemas import TrinoConnectionPayload


def settings_dep() -> Settings:
    return get_settings()


def build_trino_connector(payload: TrinoConnectionPayload) -> TrinoConnector:
    """Construct a Trino connector from a request payload."""
    cfg = TrinoConnectionConfig(
        connection_name=payload.connection_name,
        connector_type="trino",
        host=payload.host,
        port=payload.port,
        scheme=payload.scheme,
        user=payload.user,
        password=SecretStr(payload.password) if payload.password else None,
        catalog=payload.catalog,
        schema=payload.schema_name,
        http_headers=payload.http_headers,
        session_properties=payload.session_properties,
        verify_ssl=payload.verify_ssl,
        ca_certificate_path=payload.ca_certificate_path,
        source=payload.source,
        timezone=payload.timezone,
        query_timeout_seconds=payload.query_timeout_seconds,
        max_preview_rows=payload.max_preview_rows,
        max_result_rows=payload.max_result_rows,
    )
    return TrinoConnector(cfg)


def knowledge_store_dep() -> InternalKnowledgeStore:
    return get_internal_store()


def notebook_storage_dep() -> NotebookStorage:
    cfg = get_settings()
    return NotebookStorage(cfg.notebook_storage_dir)
