"""User, role, and invite token data models."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, EmailStr, Field

DEFAULT_USER_ID = "default"
DEFAULT_USER_EMAIL = "local@rednotebook.example"
DEFAULT_USER_NAME = "Local user"


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uid() -> str:
    return uuid.uuid4().hex


def _token() -> str:
    return secrets.token_urlsafe(32)


class UserRole(StrEnum):
    ADMIN = "admin"
    MEMBER = "member"


class AuthProvider(StrEnum):
    LOCAL = "local"
    GITHUB = "github"
    OIDC = "oidc"


class User(BaseModel):
    """A user of the application."""

    id: str = Field(default_factory=_uid)
    email: EmailStr
    name: str
    role: UserRole = UserRole.MEMBER
    provider: AuthProvider = AuthProvider.LOCAL
    provider_subject: str | None = None  # OAuth `sub` (immutable identifier)
    password_hash: str | None = None  # bcrypt hash, only for AuthProvider.LOCAL
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utcnow)
    last_login_at: datetime | None = None

    model_config = ConfigDict(extra="ignore")

    @property
    def is_admin(self) -> bool:
        return self.role is UserRole.ADMIN


class InviteToken(BaseModel):
    """A one-time signup token issued by an admin."""

    token: str = Field(default_factory=_token)
    email: EmailStr | None = None  # optional, restricts to this address
    role: UserRole = UserRole.MEMBER
    issued_by: str  # admin user id
    issued_at: datetime = Field(default_factory=_utcnow)
    expires_at: datetime = Field(
        default_factory=lambda: _utcnow() + timedelta(days=7)
    )
    accepted_at: datetime | None = None
    accepted_by: str | None = None

    model_config = ConfigDict(extra="ignore")

    @property
    def is_expired(self) -> bool:
        return _utcnow() > self.expires_at

    @property
    def is_consumed(self) -> bool:
        return self.accepted_at is not None

    @property
    def is_valid(self) -> bool:
        return not self.is_expired and not self.is_consumed


def make_default_user() -> User:
    """Return the synthetic 'default' user used when AUTH_ENABLED=false."""
    return User(
        id=DEFAULT_USER_ID,
        email=DEFAULT_USER_EMAIL,
        name=DEFAULT_USER_NAME,
        role=UserRole.ADMIN,
        provider=AuthProvider.LOCAL,
        password_hash=None,
        is_active=True,
    )
