"""AI provider registry — pick the right provider from settings."""

from __future__ import annotations

from rednotebook.ai.base import AIProvider
from rednotebook.config.settings import Settings, get_settings

_REGISTRY: dict[str, type[AIProvider]] = {}


def register_provider(name: str, provider_class: type[AIProvider]) -> None:
    _REGISTRY[name.lower()] = provider_class


def list_providers() -> list[str]:
    return sorted(_REGISTRY)


def get_provider(settings: Settings | None = None) -> AIProvider:
    """Return the configured AI provider instance.

    Falls back to MockAIProvider when the configured provider is unavailable
    (missing keys or import failure). This keeps local development frictionless.
    """
    cfg = settings or get_settings()
    name = (cfg.ai_provider or "mock").lower()
    provider_class = _REGISTRY.get(name)
    if provider_class is None:
        from rednotebook.ai.mock import MockAIProvider

        return MockAIProvider()
    try:
        return provider_class(cfg)  # type: ignore[arg-type]
    except Exception:
        from rednotebook.ai.mock import MockAIProvider

        return MockAIProvider()
