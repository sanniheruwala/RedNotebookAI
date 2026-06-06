"""Rate limiting via slowapi.

Limits are keyed by user id when a request is authenticated, falling back
to the client IP otherwise. When auth is disabled (laptop mode) we
short-circuit to a single shared bucket so a single user can't trip the
limiter by switching cookies.
"""

from __future__ import annotations

from fastapi import Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from starlette.responses import JSONResponse

from rednotebook.auth.sessions import (
    SESSION_COOKIE_NAME,
    InvalidSessionError,
    decode_session_token,
)
from rednotebook.auth.tokens import looks_like_api_token
from rednotebook.config.settings import get_settings


def _request_key(request: Request) -> str:
    """Best-effort identity key: user id if known, else IP."""
    cfg = get_settings()
    if not cfg.auth_enabled:
        return "shared-local"

    # API token wins over cookie because automated callers tend to share IPs
    # behind NAT.
    auth_header = request.headers.get("authorization") or ""
    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
        if looks_like_api_token(token):
            return f"token:{token[:12]}"

    session = request.cookies.get(SESSION_COOKIE_NAME)
    if session:
        try:
            payload = decode_session_token(session, cfg.secret_key)
            return f"user:{payload['sub']}"
        except InvalidSessionError:
            pass

    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_request_key, default_limits=[])


async def rate_limit_handler(
    request: Request,
    exc: RateLimitExceeded,
) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please slow down and try again shortly.",
            "limit": str(exc.detail) if exc.detail else None,
        },
        headers={"Retry-After": "30"},
    )


__all__ = ["limiter", "rate_limit_handler", "_request_key"]
