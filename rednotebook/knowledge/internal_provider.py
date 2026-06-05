"""Default internal provider — thin wrapper around InternalKnowledgeStore."""

from __future__ import annotations

from rednotebook.config.settings import Settings, get_settings
from rednotebook.knowledge.store import InternalKnowledgeStore


def get_internal_store(settings: Settings | None = None) -> InternalKnowledgeStore:
    cfg = settings or get_settings()
    return InternalKnowledgeStore(cfg.knowledge_storage_dir)
