"""Per-user resource endpoints: API tokens (and later: saved connections)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rednotebook.auth.models import APIToken, User
from rednotebook.auth.store import UserStore
from rednotebook.auth.tokens import hash_token, mint_token, token_prefix
from rednotebook.server.dependencies import require_user, user_store_dep

router = APIRouter()


class CreateTokenRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    expires_in_days: int | None = Field(default=None, ge=1, le=365 * 5)


class TokenPublic(BaseModel):
    id: str
    name: str
    prefix: str
    created_at: datetime
    last_used_at: datetime | None
    expires_at: datetime | None
    revoked_at: datetime | None

    @classmethod
    def from_token(cls, t: APIToken) -> TokenPublic:
        return cls(
            id=t.id,
            name=t.name,
            prefix=t.prefix,
            created_at=t.created_at,
            last_used_at=t.last_used_at,
            expires_at=t.expires_at,
            revoked_at=t.revoked_at,
        )


class TokenCreatedResponse(TokenPublic):
    """Returned exactly once at creation. Contains the full plaintext token."""

    plaintext: str


@router.get("/tokens", response_model=list[TokenPublic])
def list_tokens(
    user: User = Depends(require_user),
    store: UserStore = Depends(user_store_dep),
) -> list[TokenPublic]:
    return [TokenPublic.from_token(t) for t in store.list_tokens(user.id)]


@router.post("/tokens", response_model=TokenCreatedResponse)
def create_token(
    payload: CreateTokenRequest,
    user: User = Depends(require_user),
    store: UserStore = Depends(user_store_dep),
) -> TokenCreatedResponse:
    plaintext = mint_token()
    expires_at = (
        datetime.now(UTC) + timedelta(days=payload.expires_in_days)
        if payload.expires_in_days
        else None
    )
    token = APIToken(
        user_id=user.id,
        name=payload.name.strip(),
        prefix=token_prefix(plaintext),
        token_hash=hash_token(plaintext),
        expires_at=expires_at,
    )
    store.add_token(token)
    return TokenCreatedResponse(
        **TokenPublic.from_token(token).model_dump(),
        plaintext=plaintext,
    )


@router.delete("/tokens/{token_id}")
def revoke_token(
    token_id: str,
    user: User = Depends(require_user),
    store: UserStore = Depends(user_store_dep),
) -> dict[str, bool]:
    ok = store.revoke_token(token_id, user.id)
    if not ok:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"ok": True}
