"""Authentication endpoints: login, register, logout, /me."""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field

from rednotebook.audit.log import AuditEvent, AuditLog
from rednotebook.auth.models import (
    AuthProvider,
    InviteToken,
    User,
    UserRole,
)
from rednotebook.auth.passwords import (
    WeakPasswordError,
    hash_password,
    validate_password_strength,
    verify_password,
)
from rednotebook.auth.sessions import (
    SESSION_COOKIE_NAME,
    InvalidSessionError,
    create_session_token,
    decode_session_token,
)
from rednotebook.auth.store import UserStore
from rednotebook.config.settings import Settings
from rednotebook.server.dependencies import (
    audit_log_dep,
    require_user,
    settings_dep,
    user_store_dep,
)
from rednotebook.server.rate_limit import limiter

router = APIRouter()


# ----- Schemas ----------------------------------------------------------------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=200)
    invite_token: str | None = None


class UserPublic(BaseModel):
    """User shape exposed to the frontend (no secrets)."""

    id: str
    email: EmailStr
    name: str
    role: UserRole
    provider: AuthProvider
    is_active: bool
    is_admin: bool

    @classmethod
    def from_user(cls, user: User) -> UserPublic:
        return cls(
            id=user.id,
            email=user.email,
            name=user.name,
            role=user.role,
            provider=user.provider,
            is_active=user.is_active,
            is_admin=user.is_admin,
        )


class InviteRequest(BaseModel):
    email: EmailStr | None = None
    role: UserRole = UserRole.MEMBER


class InvitePublic(BaseModel):
    token: str
    email: EmailStr | None
    role: UserRole
    expires_at: datetime
    accepted_at: datetime | None


# ----- Cookie helpers ---------------------------------------------------------
def _set_session_cookie(response: Response, token: str, settings: Settings) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=settings.session_ttl_seconds,
        httponly=True,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        secure=settings.cookie_secure,
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


# ----- Endpoints --------------------------------------------------------------
@router.post("/login")
@limiter.limit("10/minute")
def login(
    request: Request,
    payload: LoginRequest,
    response: Response,
    settings: Settings = Depends(settings_dep),
    store: UserStore = Depends(user_store_dep),
    audit: AuditLog = Depends(audit_log_dep),
) -> dict[str, object]:
    if not settings.auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Auth is disabled",
        )
    user = store.get_user_by_email(payload.email)
    if (
        user is None
        or not user.is_active
        or user.provider is not AuthProvider.LOCAL
        or not verify_password(payload.password, user.password_hash or "")
    ):
        audit.record(
            AuditEvent(
                action="auth.login_failed",
                ok=False,
                user_email=payload.email,
                ip=request.client.host if request.client else None,
            )
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_session_token(
        user_id=user.id,
        secret_key=settings.secret_key,
        ttl_seconds=settings.session_ttl_seconds,
    )
    _set_session_cookie(response, token, settings)
    store.update_user(user.model_copy(update={"last_login_at": datetime.now(UTC)}))
    audit.record(
        AuditEvent(
            action="auth.login",
            user_id=user.id,
            user_email=user.email,
            ip=request.client.host if request.client else None,
        )
    )
    return {"ok": True, "user": UserPublic.from_user(user).model_dump()}


@router.post("/register")
@limiter.limit("5/minute")
def register(
    request: Request,
    payload: RegisterRequest,
    response: Response,
    settings: Settings = Depends(settings_dep),
    store: UserStore = Depends(user_store_dep),
    audit: AuditLog = Depends(audit_log_dep),
) -> dict[str, object]:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Auth is disabled")

    # Validate password
    try:
        validate_password_strength(payload.password)
    except WeakPasswordError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    invite: InviteToken | None = None
    is_bootstrap = store.is_first_signup()

    if is_bootstrap:
        # First user becomes admin. No invite required.
        role = UserRole.ADMIN
    else:
        if payload.invite_token:
            invite = store.get_invite(payload.invite_token)
            if invite is None or not invite.is_valid:
                raise HTTPException(
                    status_code=400, detail="Invite token is invalid or expired"
                )
            if invite.email and invite.email.lower() != payload.email.lower():
                raise HTTPException(
                    status_code=400, detail="Invite is for a different email"
                )
            role = invite.role
        elif settings.allow_self_signup:
            role = UserRole.MEMBER
        else:
            raise HTTPException(
                status_code=403,
                detail="Signup is invite-only on this instance",
            )

    if store.get_user_by_email(payload.email):
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(
        email=payload.email,
        name=payload.name.strip(),
        role=role,
        provider=AuthProvider.LOCAL,
        password_hash=hash_password(payload.password),
        last_login_at=datetime.now(UTC),
    )
    store.add_user(user)
    if invite is not None:
        store.consume_invite(invite.token, user.id)

    token = create_session_token(
        user_id=user.id,
        secret_key=settings.secret_key,
        ttl_seconds=settings.session_ttl_seconds,
    )
    _set_session_cookie(response, token, settings)
    audit.record(
        AuditEvent(
            action="auth.register",
            user_id=user.id,
            user_email=user.email,
            details={"role": user.role.value, "bootstrap": is_bootstrap},
            ip=request.client.host if request.client else None,
        )
    )
    return {
        "ok": True,
        "user": UserPublic.from_user(user).model_dump(),
        "is_bootstrap": is_bootstrap,
    }


@router.post("/logout")
def logout(response: Response) -> dict[str, bool]:
    _clear_session_cookie(response)
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
def me(user: User = Depends(require_user)) -> UserPublic:
    return UserPublic.from_user(user)


@router.post("/invite", response_model=InvitePublic)
def create_invite(
    payload: InviteRequest,
    settings: Settings = Depends(settings_dep),
    store: UserStore = Depends(user_store_dep),
    admin: User = Depends(require_user),
) -> InvitePublic:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Auth is disabled")
    if not admin.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    invite = store.add_invite(
        InviteToken(
            email=payload.email,
            role=payload.role,
            issued_by=admin.id,
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
def list_invites(
    store: UserStore = Depends(user_store_dep),
    admin: User = Depends(require_user),
) -> list[InvitePublic]:
    if not admin.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
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


@router.get("/status")
def auth_status(
    session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
    settings: Settings = Depends(settings_dep),
    store: UserStore = Depends(user_store_dep),
) -> dict[str, object]:
    """Lightweight endpoint the frontend can poll without 401-ing."""
    out: dict[str, object] = {
        "auth_enabled": settings.auth_enabled,
        "allow_self_signup": settings.allow_self_signup,
        "is_bootstrap": store.is_first_signup() if settings.auth_enabled else False,
        "authenticated": False,
        "user": None,
    }
    if not settings.auth_enabled:
        return out
    if not session:
        return out
    try:
        payload = decode_session_token(session, settings.secret_key)
    except InvalidSessionError:
        return out
    user = store.get_user(payload["sub"])
    if user and user.is_active:
        out["authenticated"] = True
        out["user"] = UserPublic.from_user(user).model_dump()
    return out
