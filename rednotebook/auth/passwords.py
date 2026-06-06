"""Password hashing helpers (bcrypt)."""

from __future__ import annotations

import bcrypt

MIN_PASSWORD_LENGTH = 8


class WeakPasswordError(ValueError):
    """Raised when a password does not meet basic strength requirements."""


def validate_password_strength(password: str) -> None:
    """Reject weak passwords. Returns silently when password is acceptable."""
    if len(password) < MIN_PASSWORD_LENGTH:
        raise WeakPasswordError(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters"
        )
    if password.lower() in {"password", "12345678", "qwerty12", "letmein!"}:
        raise WeakPasswordError("Password is in the common-passwords list")


def hash_password(password: str) -> str:
    """Return a bcrypt hash for the given password."""
    return bcrypt.hashpw(
        password.encode("utf-8"), bcrypt.gensalt(rounds=12)
    ).decode("utf-8")


def verify_password(password: str, stored_hash: str) -> bool:
    """Return True if the password matches the stored bcrypt hash."""
    if not stored_hash:
        return False
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), stored_hash.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False
