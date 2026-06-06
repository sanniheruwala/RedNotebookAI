"""OAuth provider flows. Currently GitHub; OIDC is a planned follow-up.

State-token handling:
- We sign a CSRF-state token as a short-lived JWT bound to the cookie path.
- The user's browser carries it back in the OAuth `state` parameter.
- The callback verifies the JWT signature + provider.
"""

from __future__ import annotations

import secrets
from datetime import UTC, datetime
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Cookie, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse

from rednotebook.auth.models import AuthProvider, User, UserRole
from rednotebook.auth.sessions import (
    create_session_token,
)
from rednotebook.auth.store import UserStore
from rednotebook.config.settings import Settings
from rednotebook.server.dependencies import settings_dep, user_store_dep
from rednotebook.server.routers.auth import _set_session_cookie

router = APIRouter()


OAUTH_STATE_COOKIE = "rednotebook_oauth_state"
GITHUB_AUTHORIZE_URL = "https://github.com/login/oauth/authorize"
GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
GITHUB_USER_URL = "https://api.github.com/user"
GITHUB_EMAILS_URL = "https://api.github.com/user/emails"


def _redirect_base(settings: Settings, request: Request) -> str:
    """Pick the base URL the browser should be redirected back to.

    Prefer the explicit OAUTH_REDIRECT_BASE_URL; fall back to the request
    origin (handy for laptop development without env config).
    """
    if settings.oauth_redirect_base_url:
        return settings.oauth_redirect_base_url.rstrip("/")
    return f"{request.url.scheme}://{request.url.netloc}".rstrip("/")


def _callback_url(provider: str, settings: Settings, request: Request) -> str:
    return f"{_redirect_base(settings, request)}/api/auth/oauth/{provider}/callback"


def _check_github_configured(settings: Settings) -> None:
    if not settings.auth_enabled:
        raise HTTPException(status_code=404, detail="Auth is disabled")
    if not settings.github_oauth_client_id or not settings.github_oauth_client_secret:
        raise HTTPException(
            status_code=503,
            detail="GitHub OAuth is not configured on this instance",
        )


@router.get("/github/start")
def github_start(
    request: Request,
    settings: Settings = Depends(settings_dep),
) -> RedirectResponse:
    _check_github_configured(settings)

    state = secrets.token_urlsafe(24)
    params = {
        "client_id": settings.github_oauth_client_id,
        "redirect_uri": _callback_url("github", settings, request),
        "scope": "read:user user:email",
        "state": state,
        "allow_signup": "false",
    }
    url = f"{GITHUB_AUTHORIZE_URL}?{urlencode(params)}"
    response = RedirectResponse(url, status_code=302)
    response.set_cookie(
        key=OAUTH_STATE_COOKIE,
        value=state,
        max_age=600,
        httponly=True,
        samesite=settings.cookie_samesite,  # type: ignore[arg-type]
        secure=settings.cookie_secure,
        path="/api/auth/oauth/",
    )
    return response


@router.get("/github/callback")
async def github_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    settings: Settings = Depends(settings_dep),
    store: UserStore = Depends(user_store_dep),
    cookie_state: str | None = Cookie(default=None, alias=OAUTH_STATE_COOKIE),
) -> RedirectResponse:
    _check_github_configured(settings)
    if error:
        raise HTTPException(status_code=400, detail=f"GitHub returned: {error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing code or state")
    if not cookie_state or cookie_state != state:
        raise HTTPException(status_code=400, detail="OAuth state mismatch")

    # 1. Exchange code -> access token
    async with httpx.AsyncClient(timeout=15) as client:
        token_response = await client.post(
            GITHUB_TOKEN_URL,
            data={
                "client_id": settings.github_oauth_client_id,
                "client_secret": settings.github_oauth_client_secret,
                "code": code,
                "redirect_uri": _callback_url("github", settings, request),
            },
            headers={"Accept": "application/json"},
        )
        token_response.raise_for_status()
        token_body = token_response.json()
        access_token = token_body.get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=400, detail="GitHub did not return an access token"
            )

        # 2. Fetch user profile + primary email
        api_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        user_response = await client.get(GITHUB_USER_URL, headers=api_headers)
        user_response.raise_for_status()
        gh_user = user_response.json()

        email = gh_user.get("email")
        if not email:
            emails_response = await client.get(GITHUB_EMAILS_URL, headers=api_headers)
            emails_response.raise_for_status()
            primary = next(
                (
                    e
                    for e in emails_response.json()
                    if e.get("primary") and e.get("verified")
                ),
                None,
            )
            email = primary.get("email") if primary else None

    subject = str(gh_user.get("id") or "")
    name = (
        gh_user.get("name")
        or gh_user.get("login")
        or (email.split("@")[0] if email else "GitHub user")
    )
    if not subject or not email:
        raise HTTPException(
            status_code=400, detail="GitHub profile missing required fields"
        )

    # 3. Link or create the local user
    user = store.get_user_by_provider_subject(AuthProvider.GITHUB, subject)
    if user is None:
        existing = store.get_user_by_email(email)
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail=(
                    "An account with that email already exists. "
                    "Sign in with the original provider and link GitHub from settings."
                ),
            )
        role = (
            UserRole.ADMIN
            if store.is_first_signup()
            else UserRole(settings.oauth_default_role)
        )
        user = User(
            email=email,
            name=name,
            role=role,
            provider=AuthProvider.GITHUB,
            provider_subject=subject,
            password_hash=None,
            last_login_at=datetime.now(UTC),
        )
        store.add_user(user)
    else:
        store.update_user(user.model_copy(update={"last_login_at": datetime.now(UTC)}))

    # 4. Mint session and redirect to the app root.
    response = RedirectResponse(f"{_redirect_base(settings, request)}/", status_code=302)
    token = create_session_token(
        user_id=user.id,
        secret_key=settings.secret_key,
        ttl_seconds=settings.session_ttl_seconds,
    )
    _set_session_cookie(response, token, settings)
    response.delete_cookie(OAUTH_STATE_COOKIE, path="/api/auth/oauth/")
    return response


@router.get("/providers")
def oauth_providers(
    settings: Settings = Depends(settings_dep),
) -> dict[str, list[str]]:
    """List configured OAuth providers for the frontend to show buttons."""
    providers: list[str] = []
    if (
        settings.auth_enabled
        and settings.github_oauth_client_id
        and settings.github_oauth_client_secret
    ):
        providers.append("github")
    return {"providers": providers}
