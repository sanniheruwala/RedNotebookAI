"""Admin-only endpoints: AI config, users + invites, audit log."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from rednotebook.admin.runtime_config import RuntimeConfigStore
from rednotebook.ai.registry import list_providers
from rednotebook.audit.log import AuditEvent, AuditLog
from rednotebook.auth.models import InviteToken, User, UserRole
from rednotebook.auth.store import UserStore
from rednotebook.server.dependencies import (
    audit_log_dep,
    require_admin,
    runtime_config_dep,
    user_store_dep,
)
from rednotebook.server.routers.auth import InvitePublic, UserPublic

router = APIRouter()


# ----- AI provider runtime config -------------------------------------------
class AIRuntimeConfig(BaseModel):
    """Subset of settings.* that admins can override at runtime.

    Sensitive fields are returned masked on GET. PUT accepts plaintext;
    sending null clears the override.
    """

    ai_provider: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    anthropic_api_key: str | None = None
    anthropic_model: str | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
    ai_context_mode: str | None = None
    ai_allow_sample_rows: bool | None = None
    ai_sample_row_limit: int | None = None
    ai_mask_pii: bool | None = None


def _mask_secret(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "•" * len(value)
    return value[:4] + "•" * 8 + value[-4:]


@router.post("/config/ai/test")
def test_ai_config(
    _admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Probe the configured AI provider with a trivial prompt.

    Lets the admin verify a key + model combo from the UI instead of
    discovering the failure later via Explain / Optimize / Ask AI etc.
    Returns ``{ok, provider, model, sample, error}``.
    """
    from rednotebook.ai.base import AIContext
    from rednotebook.ai.errors import AIProviderError
    from rednotebook.ai.registry import get_provider, resolve_settings

    settings = resolve_settings()
    provider = get_provider(settings)
    model_attr = getattr(provider, "_model", None)
    if provider.name == "mock":
        return {
            "ok": False,
            "provider": "mock",
            "model": None,
            "sample": None,
            "error": (
                "Current provider is 'mock'. Save an API key (and pick a "
                "provider above) to test a real AI."
            ),
        }
    try:
        text = provider.explain_sql("SELECT 1", AIContext())
    except AIProviderError as exc:
        return {
            "ok": False,
            "provider": exc.provider,
            "model": exc.model,
            "sample": None,
            "error": str(exc),
        }
    except Exception as exc:  # pragma: no cover - defensive
        return {
            "ok": False,
            "provider": provider.name,
            "model": model_attr,
            "sample": None,
            "error": f"Unexpected error: {exc}",
        }
    return {
        "ok": True,
        "provider": provider.name,
        "model": model_attr,
        "sample": text[:200],
        "error": None,
    }


@router.get("/config/ai")
def get_ai_config(
    store: RuntimeConfigStore = Depends(runtime_config_dep),
    _admin: User = Depends(require_admin),
) -> dict[str, Any]:
    """Return the admin-set AI overrides. Secrets are masked."""
    cfg = store.get("ai", {}) or {}
    return {
        "ai_provider": cfg.get("ai_provider"),
        "openai_api_key": _mask_secret(cfg.get("openai_api_key")),
        "openai_model": cfg.get("openai_model"),
        "anthropic_api_key": _mask_secret(cfg.get("anthropic_api_key")),
        "anthropic_model": cfg.get("anthropic_model"),
        "ollama_base_url": cfg.get("ollama_base_url"),
        "ollama_model": cfg.get("ollama_model"),
        "ai_context_mode": cfg.get("ai_context_mode"),
        "ai_allow_sample_rows": cfg.get("ai_allow_sample_rows"),
        "ai_sample_row_limit": cfg.get("ai_sample_row_limit"),
        "ai_mask_pii": cfg.get("ai_mask_pii"),
        "available_providers": list_providers(),
    }


@router.put("/config/ai")
def update_ai_config(
    payload: AIRuntimeConfig,
    store: RuntimeConfigStore = Depends(runtime_config_dep),
    audit: AuditLog = Depends(audit_log_dep),
    admin: User = Depends(require_admin),
) -> dict[str, bool | str | None]:
    """Set / clear admin AI overrides. Sending null on a field clears it.

    "Do what I mean" wiring: if the admin just supplied a key for a
    provider and hasn't already picked an active provider override, the
    matching provider becomes active. Otherwise an OpenAI key sitting
    next to an empty selector silently routes every AI call to the mock
    provider — which was the v0.7.5–0.7.7 trap.
    """
    current = store.get("ai", {}) or {}
    incoming = payload.model_dump(exclude_unset=True)
    # Preserve existing secret when the admin sends back the masked value.
    for secret_field in ("openai_api_key", "anthropic_api_key"):
        if secret_field in incoming:
            value = incoming[secret_field]
            if isinstance(value, str) and "•" in value:
                # Looks like a masked round-trip; keep the existing value.
                incoming[secret_field] = current.get(secret_field)
    merged = {**current, **incoming}

    # Auto-switch provider if (a) a real key was just supplied for a
    # specific provider and (b) no provider override is currently active.
    # Keep this implicit only when the field is empty — never override a
    # provider the admin already picked.
    auto_switched: str | None = None
    if not merged.get("ai_provider"):
        provider_for_key: dict[str, str] = {
            "anthropic_api_key": "anthropic",
            "openai_api_key": "openai",
        }
        for key_field, provider_name in provider_for_key.items():
            if (
                key_field in incoming
                and isinstance(incoming[key_field], str)
                and incoming[key_field]
            ):
                merged["ai_provider"] = provider_name
                auto_switched = provider_name
                break

    # Drop None values so unsets actually unset.
    merged = {k: v for k, v in merged.items() if v is not None and v != ""}
    store.set("ai", merged)
    audit.record(
        AuditEvent(
            action="admin.update_ai_config",
            user_id=admin.id,
            user_email=admin.email,
            details={
                "fields": sorted(incoming.keys()),
                "auto_switched_provider": auto_switched,
            },
        )
    )
    return {"ok": True, "auto_switched_provider": auto_switched}


# ----- Audit log -------------------------------------------------------------
@router.get("/audit")
def list_audit_events(
    limit: int = 200,
    action: str | None = None,
    user_id: str | None = None,
    audit: AuditLog = Depends(audit_log_dep),
    _admin: User = Depends(require_admin),
) -> dict[str, list[dict]]:
    """Tail of the audit log."""
    return {
        "events": audit.tail(
            limit=min(limit, 1000),
            action_filter=action,
            user_id_filter=user_id,
        )
    }


# ----- Users + invites -------------------------------------------------------
@router.get("/users", response_model=list[UserPublic])
def list_users(
    store: UserStore = Depends(user_store_dep),
    _admin: User = Depends(require_admin),
) -> list[UserPublic]:
    return [UserPublic.from_user(u) for u in store.list_users()]


class CreateInviteRequest(BaseModel):
    email: str | None = None
    role: UserRole = UserRole.MEMBER


@router.post("/invites", response_model=InvitePublic)
def create_invite_admin(
    payload: CreateInviteRequest,
    store: UserStore = Depends(user_store_dep),
    audit: AuditLog = Depends(audit_log_dep),
    admin: User = Depends(require_admin),
) -> InvitePublic:
    """Mint an invite token. Mirror of /api/auth/invite but lives under /admin."""
    invite = store.add_invite(
        InviteToken(
            email=payload.email,
            role=payload.role,
            issued_by=admin.id,
        )
    )
    audit.record(
        AuditEvent(
            action="admin.invite_created",
            user_id=admin.id,
            user_email=admin.email,
            details={"role": payload.role.value, "email": payload.email},
        )
    )
    return InvitePublic(
        token=invite.token,
        email=invite.email,
        role=invite.role,
        expires_at=invite.expires_at,
        accepted_at=invite.accepted_at,
    )


@router.get("/invites", response_model=list[InvitePublic])
def list_invites_admin(
    store: UserStore = Depends(user_store_dep),
    _admin: User = Depends(require_admin),
) -> list[InvitePublic]:
    return [
        InvitePublic(
            token=i.token,
            email=i.email,
            role=i.role,
            expires_at=i.expires_at,
            accepted_at=i.accepted_at,
        )
        for i in store.list_invites()
    ]


