"""Application settings loaded from environment / .env file."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

AIProviderName = Literal["mock", "openai", "anthropic", "ollama"]
KnowledgeProviderName = Literal["internal", "notebooklm_enterprise"]
AIContextMode = Literal["schema_only", "schema_and_stats", "schema_stats_samples"]


class Settings(BaseSettings):
    """All runtime configuration for RedNotebook AI."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # App
    app_name: str = Field(default="RedNotebook AI")
    app_env: str = Field(default="local")

    # Query safety / limits
    allow_write_queries: bool = Field(default=False)
    default_preview_rows: int = Field(default=100, ge=1, le=10_000)
    default_max_result_rows: int = Field(default=10_000, ge=1, le=10_000_000)
    default_query_timeout_seconds: int = Field(default=300, ge=1, le=3600)
    chart_warning_threshold: int = Field(default=10_000, ge=1)

    # Trino defaults (used to prefill the connection form)
    trino_host: str | None = None
    trino_port: int = 443
    trino_scheme: str = "https"
    trino_user: str | None = None
    trino_password: str | None = None
    trino_catalog: str | None = None
    trino_schema: str | None = None
    trino_verify_ssl: bool = True
    trino_ca_cert_path: str | None = None

    # AI
    ai_provider: AIProviderName = "mock"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-4-6"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3"

    # AI context controls
    ai_context_mode: AIContextMode = "schema_and_stats"
    ai_allow_sample_rows: bool = False
    ai_sample_row_limit: int = 20
    ai_mask_pii: bool = True

    # Knowledge notebook
    knowledge_provider: KnowledgeProviderName = "internal"
    knowledge_storage_dir: str = "local_data/knowledge"
    notebook_storage_dir: str = "local_data/notebooks"
    artifacts_dir: str = "artifacts"
    exports_dir: str = "exports"

    # Auth
    auth_enabled: bool = False
    auth_storage_dir: str = "local_data/auth"
    secret_key: str = "change-me-in-production-use-a-long-random-string"
    session_ttl_seconds: int = 60 * 60 * 24 * 7
    cookie_secure: bool = False  # set True behind HTTPS reverse proxy
    cookie_samesite: str = "lax"
    allow_self_signup: bool = False

    # NotebookLM Enterprise (experimental, off by default)
    notebooklm_enterprise_enabled: bool = False
    google_cloud_project: str | None = None
    google_cloud_location: str = "global"
    notebooklm_endpoint_location: str = "global"


@lru_cache
def get_settings() -> Settings:
    """Return cached settings instance."""
    return Settings()


def reload_settings() -> Settings:
    """Force-reload settings (useful in tests)."""
    get_settings.cache_clear()
    return get_settings()
