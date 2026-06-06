"""Admin-only endpoints (audit log, users)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from rednotebook.audit.log import AuditLog
from rednotebook.auth.models import User
from rednotebook.auth.store import UserStore
from rednotebook.server.dependencies import (
    audit_log_dep,
    require_admin,
    user_store_dep,
)
from rednotebook.server.routers.auth import UserPublic

router = APIRouter()


@router.get("/audit")
def list_audit_events(
    limit: int = 200,
    action: str | None = None,
    user_id: str | None = None,
    audit: AuditLog = Depends(audit_log_dep),
    _admin: User = Depends(require_admin),
) -> dict[str, list[dict]]:
    """Tail of the audit log. Admin only."""
    return {
        "events": audit.tail(
            limit=min(limit, 1000),
            action_filter=action,
            user_id_filter=user_id,
        )
    }


@router.get("/users", response_model=list[UserPublic])
def list_users(
    store: UserStore = Depends(user_store_dep),
    _admin: User = Depends(require_admin),
) -> list[UserPublic]:
    return [UserPublic.from_user(u) for u in store.list_users()]
