"""Health and version endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from rednotebook import __version__
from rednotebook.ai.registry import get_provider, list_providers, resolve_settings
from rednotebook.config.settings import get_settings
from rednotebook.connectors.registry import available_connectors

router = APIRouter()


@router.get("/api/health")
def healthcheck() -> dict[str, object]:
    settings = get_settings()
    # Effective provider = runtime override (admin UI) applied on top of
    # env-var settings, plus the actual provider instance after init.
    # "configured" is what the user picked; "active" is what's wired,
    # which differs whenever the configured provider can't be loaded.
    resolved = resolve_settings(settings)
    active_provider = get_provider(settings).name
    return {
        "ok": True,
        "version": __version__,
        "app_env": settings.app_env,
        "ai_provider": resolved.ai_provider,
        "ai_provider_active": active_provider,
        "available_providers": list_providers(),
        "available_connectors": available_connectors(),
        "allow_write_queries": settings.allow_write_queries,
        "ai_context_mode": settings.ai_context_mode,
    }
