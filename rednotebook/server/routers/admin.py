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
) -> dict[str, bool]:
    """Set / clear admin AI overrides. Sending null on a field clears it."""
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
    # Drop None values so unsets actually unset.
    merged = {k: v for k, v in merged.items() if v is not None and v != ""}
    store.set("ai", merged)
    audit.record(
        AuditEvent(
            action="admin.update_ai_config",
            user_id=admin.id,
            user_email=admin.email,
            details={"fields": sorted(incoming.keys())},
        )
    )
    return {"ok": True}


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


