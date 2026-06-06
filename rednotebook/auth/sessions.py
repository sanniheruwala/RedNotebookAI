"""JWT session helpers.

Sessions are stateless JWTs (HS256) signed with the server's `secret_key`.
They're delivered as HTTP-only cookies. No refresh tokens for now: short-ish
expiry, sign back in on expiry. Good enough for self-hosted local-first.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

JWT_ALGORITHM = "HS256"
SESSION_COOKIE_NAME = "rednotebook_session"


class InvalidSessionError(Exception):
    """Raised when a session token cannot be decoded or has expired."""


def create_session_token(
    *,
    user_id: str,
    secret_key: str,
    ttl_seconds: int = 60 * 60 * 24 * 7,  # 7 days
    extra_claims: dict[str, Any] | None = None,
) -> str:
    """Mint a signed JWT for the given user id."""
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": user_id,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=ttl_seconds)).timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, secret_key, algorithm=JWT_ALGORITHM)


def decode_session_token(token: str, secret_key: str) -> dict[str, Any]:
    """Decode and validate a session JWT. Raises InvalidSessionError on failure."""
    try:
        payload = jwt.decode(token, secret_key, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise InvalidSessionError("Session expired") from exc
    except jwt.InvalidTokenError as exc:
        raise InvalidSessionError("Invalid session token") from exc
    if "sub" not in payload:
        raise InvalidSessionError("Session token missing subject")
    return payload
