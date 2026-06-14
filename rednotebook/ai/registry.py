"""AI provider registry, pick the right provider from settings."""

from __future__ import annotations

import logging
from typing import Any

from rednotebook.ai.base import AIProvider
from rednotebook.config.settings import Settings, get_settings

_log = logging.getLogger(__name__)

_REGISTRY: dict[str, type[AIProvider]] = {}

# Keys the admin runtime config is allowed to override. Anything else stays
# governed by env vars / .env.
_AI_OVERRIDE_FIELDS: tuple[str, ...] = (
    "ai_provider",
    "openai_api_key",
    "openai_model",
    "anthropic_api_key",
    "anthropic_model",
    "ollama_base_url",
    "ollama_model",
    "ai_context_mode",
    "ai_allow_sample_rows",
    "ai_sample_row_limit",
    "ai_mask_pii",
)


def register_provider(name: str, provider_class: type[AIProvider]) -> None:
    _REGISTRY[name.lower()] = provider_class


def list_providers() -> list[str]:
    return sorted(_REGISTRY)


def _runtime_overrides(settings: Settings) -> dict[str, Any]:
    """Load admin-set AI overrides from the encrypted runtime config store.

    The store is best-effort: any failure (missing file, key rotation,
    malformed JSON) silently degrades to "no overrides" so the AI flow keeps
    working with env-var defaults.
    """
    try:
        from rednotebook.admin.runtime_config import RuntimeConfigStore

        store = RuntimeConfigStore(
            settings.runtime_config_dir, settings.secret_key
        )
        ai_cfg = store.get("ai", {}) or {}
        return {k: v for k, v in ai_cfg.items() if k in _AI_OVERRIDE_FIELDS and v is not None}
    except Exception:
        return {}


def resolve_settings(settings: Settings | None = None) -> Settings:
    """Return a Settings instance with admin runtime AI overrides applied."""
    cfg = settings or get_settings()
    overrides = _runtime_overrides(cfg)
    if not overrides:
        return cfg
    return cfg.model_copy(update=overrides)


def get_provider(settings: Settings | None = None) -> AIProvider:
    """Return the configured AI provider instance.

    Resolution order for AI configuration:
      1. Admin runtime config (encrypted, set via the admin UI)
      2. Settings (env vars / .env)
      3. MockAIProvider fallback on any error

    This keeps `.env`-driven local setups working while letting team admins
    flip providers and rotate keys from the UI without a redeploy.

    Any fallback to mock is logged at WARNING — silent fallback once cost
    a release cycle of "AI seems to be not working", because the configured
    provider failed to instantiate (missing SDK, missing key) and there was
    no signal that anything had gone wrong.
    """
    cfg = resolve_settings(settings)
    name = (cfg.ai_provider or "mock").lower()
    provider_class = _REGISTRY.get(name)
    if provider_class is None:
        from rednotebook.ai.mock import MockAIProvider

        if name != "mock":
            _log.warning(
                "AI provider %r is not registered; falling back to MockAIProvider. "
                "Registered providers: %s",
                name,
                sorted(_REGISTRY),
            )
        return MockAIProvider()
    try:
        return provider_class(cfg)  # type: ignore[arg-type]
    except Exception as exc:
        from rednotebook.ai.mock import MockAIProvider

        _log.warning(
            "AI provider %r failed to initialise (%s); falling back to "
            "MockAIProvider. For 'bundled' check the GGUF model at "
            "/app/models/ + llama-cpp-python install; for 'openai' / "
            "'anthropic' check the API key + model name; for 'ollama' "
            "check the server URL.",
            name,
            exc,
        )
        return MockAIProvider()
