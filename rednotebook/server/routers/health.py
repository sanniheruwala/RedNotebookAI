"""Health and version endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from rednotebook import __version__
from rednotebook.ai.registry import list_providers
from rednotebook.config.settings import get_settings
from rednotebook.connectors.registry import available_connectors

router = APIRouter()


@router.get("/api/health")
def healthcheck() -> dict[str, object]:
    settings = get_settings()
    return {
        "ok": True,
        "version": __version__,
        "app_env": settings.app_env,
        "ai_provider": settings.ai_provider,
        "available_providers": list_providers(),
        "available_connectors": available_connectors(),
        "allow_write_queries": settings.allow_write_queries,
        "ai_context_mode": settings.ai_context_mode,
    }
