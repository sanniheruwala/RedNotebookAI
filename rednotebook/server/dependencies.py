"""FastAPI dependency helpers."""

from __future__ import annotations

from pathlib import Path

from fastapi import Cookie, Depends, Header, HTTPException, status
from pydantic import SecretStr

from rednotebook.auth.models import User, make_default_user
from rednotebook.auth.sessions import (
    SESSION_COOKIE_NAME,
    InvalidSessionError,
    decode_session_token,
)
from rednotebook.auth.store import UserStore
from rednotebook.auth.tokens import looks_like_api_token, verify_token
from rednotebook.config.settings import Settings, get_settings
from rednotebook.connectors.trino import TrinoConnectionConfig, TrinoConnector
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


def build_connector(payload):  # type: ignore[no-untyped-def]
    """Build a connector from any ConnectionPayload (Trino or DuckDB).

    Dispatches on the discriminator field so new connectors can be added
    without touching every router. Always prefer this over the
    Trino-specific helper above.
    """
    from rednotebook.connectors.duckdb import (
        DuckDBConnectionConfig,
        DuckDBConnector,
    )

    connector_type = getattr(payload, "connector_type", "trino")
    if connector_type == "duckdb":
        cfg = DuckDBConnectionConfig(
            connection_name=payload.connection_name,
            connector_type="duckdb",
            database=payload.database,
            read_only=payload.read_only,
            working_dir=payload.working_dir,
            max_result_rows=payload.max_result_rows,
        )
        return DuckDBConnector(cfg)
    return build_trino_connector(payload)


# ---------------------------------------------------------------------------
# Auth dependencies
# ---------------------------------------------------------------------------
def user_store_dep(settings: Settings = Depends(settings_dep)) -> UserStore:
    return UserStore(settings.auth_storage_dir)


def require_user(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(settings_dep),
    store: UserStore = Depends(user_store_dep),
) -> User:
    """Resolve the current user, or substitute the synthetic default user.

    Resolution order (when AUTH_ENABLED):
      1. ``Authorization: Bearer <api-token>`` if shaped like ``rnt_*``
      2. Session cookie

    When AUTH_ENABLED is false, the app behaves as today: a single shared
    "default" user owns every notebook and knowledge resource.
    """
    if not settings.auth_enabled:
        return make_default_user()

    # ---------- 1. Bearer API token ----------
    if authorization and authorization.lower().startswith("bearer "):
        plaintext = authorization.split(" ", 1)[1].strip()
        if looks_like_api_token(plaintext):
            user = _user_from_api_token(plaintext, store)
            if user is not None:
                return user
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid API token",
            )

    # ---------- 2. Session cookie ----------
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )
    try:
        payload = decode_session_token(session, settings.secret_key)
    except InvalidSessionError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    user = store.get_user(payload["sub"])
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists or is disabled",
        )
    return user


def _user_from_api_token(plaintext: str, store: UserStore) -> User | None:
    """Look up the user for a Bearer API token; refresh last_used_at."""
    for token in store.list_tokens():
        if not token.is_valid:
            continue
        if not plaintext.startswith(token.prefix):
            continue
        if verify_token(plaintext, token.token_hash):
            store.touch_token(token.id)
            user = store.get_user(token.user_id)
            if user and user.is_active:
                return user
            return None
    return None


def require_admin(user: User = Depends(require_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return user


# ---------------------------------------------------------------------------
# Storage dependencies, scoped to the current user
# ---------------------------------------------------------------------------
def knowledge_store_dep(
    settings: Settings = Depends(settings_dep),
    user: User = Depends(require_user),
) -> InternalKnowledgeStore:
    base = Path(settings.knowledge_storage_dir) / user.id
    return InternalKnowledgeStore(base)


def notebook_storage_dep(
    settings: Settings = Depends(settings_dep),
    user: User = Depends(require_user),
) -> NotebookStorage:
    base = Path(settings.notebook_storage_dir) / user.id
    return NotebookStorage(base)


def connection_store_dep(settings: Settings = Depends(settings_dep)):
    """Return a shared, encrypted ConnectionStore for the current user."""
    from rednotebook.connectors.store import ConnectionStore

    return ConnectionStore(settings.connection_storage_dir, settings.secret_key)


def audit_log_dep(settings: Settings = Depends(settings_dep)):
    """Return a shared AuditLog for write access from request handlers."""
    from rednotebook.audit.log import AuditLog

    return AuditLog(settings.audit_storage_dir)
