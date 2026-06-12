"""FastAPI application entry point."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from slowapi.errors import RateLimitExceeded

from rednotebook import __version__
from rednotebook.config.settings import get_settings
from rednotebook.migrations.auto_namespace import run_namespace_migration
from rednotebook.server.dependencies import require_user
from rednotebook.server.rate_limit import limiter, rate_limit_handler
from rednotebook.server.routers import (
    admin,
    ai,
    auth,
    charts,
    connections,
    connections_me,
    health,
    infographics,
    knowledge,
    me,
    metadata,
    notebooks,
    oauth,
    public,
    query,
    uploads,
)

# Register optional AI providers (their import calls register_provider).
try:  # pragma: no cover - optional
    import rednotebook.ai.openai_provider  # noqa: F401
except Exception:
    pass
try:  # pragma: no cover - optional
    import rednotebook.ai.anthropic_provider  # noqa: F401
except Exception:
    pass
try:  # pragma: no cover - optional
    import rednotebook.ai.ollama_provider  # noqa: F401
except Exception:
    pass
try:  # pragma: no cover - optional
    import rednotebook.ai.cursor_provider  # noqa: F401
except Exception:
    pass


def create_app() -> FastAPI:
    settings = get_settings()

    # Move existing un-namespaced data under the default user's directory.
    # Idempotent: skips if the destination already has content.
    try:
        run_namespace_migration(
            notebook_dir=settings.notebook_storage_dir,
            knowledge_dir=settings.knowledge_storage_dir,
        )
    except Exception:  # pragma: no cover - best-effort migration
        pass

    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="Open-source AI data notebook for Trino and modern data platforms.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Rate limiting (slowapi). Per-endpoint limits live in the routers.
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

    # Auth-protected dependency. Bypassed when AUTH_ENABLED is false.
    protected = [Depends(require_user)]

    app.include_router(health.router)
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(oauth.router, prefix="/api/auth/oauth", tags=["oauth"])
    app.include_router(
        me.router,
        prefix="/api/me",
        tags=["me"],
        dependencies=protected,
    )
    app.include_router(
        connections_me.router,
        prefix="/api/me/connections",
        tags=["me/connections"],
        dependencies=protected,
    )
    app.include_router(
        admin.router,
        prefix="/api/admin",
        tags=["admin"],
        dependencies=protected,
    )
    app.include_router(
        connections.router,
        prefix="/api/connections",
        tags=["connections"],
        dependencies=protected,
    )
    app.include_router(
        metadata.router,
        prefix="/api/metadata",
        tags=["metadata"],
        dependencies=protected,
    )
    app.include_router(
        query.router,
        prefix="/api/query",
        tags=["query"],
        dependencies=protected,
    )
    app.include_router(
        ai.router, prefix="/api/ai", tags=["ai"], dependencies=protected
    )
    app.include_router(
        charts.router,
        prefix="/api/charts",
        tags=["charts"],
        dependencies=protected,
    )
    app.include_router(
        knowledge.router,
        prefix="/api/knowledge",
        tags=["knowledge"],
        dependencies=protected,
    )
    app.include_router(
        infographics.router,
        prefix="/api/infographics",
        tags=["infographics"],
        dependencies=protected,
    )
    app.include_router(
        notebooks.router,
        prefix="/api/notebooks",
        tags=["notebooks"],
        dependencies=protected,
    )
    app.include_router(
        uploads.router,
        prefix="/api/files",
        tags=["uploads"],
        dependencies=protected,
    )
    # `public.router` exposes the unauthenticated `/published/{token}`
    # endpoint. Deliberately NOT under `/api` and NOT behind `protected`
    # so anyone holding a share link can view a published notebook.
    app.include_router(public.router, tags=["public"])
    return app


def _resolve_static_frontend_dir() -> Path | None:
    """Look up the bundled Next.js export directory, if any.

    Order:
      1. ``$REDNOTEBOOK_STATIC_DIR`` env override.
      2. ``rednotebook/static_frontend`` packaged with the wheel/binary.
      3. ``frontend/out`` next to the repo root (developer convenience).
      4. PyInstaller ``_MEIPASS``/static_frontend (one-file bundles).
    """
    env = os.environ.get("REDNOTEBOOK_STATIC_DIR")
    candidates = []
    if env:
        candidates.append(Path(env))
    here = Path(__file__).resolve().parent
    candidates.append(here.parent / "static_frontend")
    candidates.append(here.parent.parent / "frontend" / "out")
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        candidates.append(Path(meipass) / "static_frontend")
    for c in candidates:
        if c.is_dir() and (c / "index.html").exists():
            return c
    return None


def _mount_static_frontend(app: FastAPI) -> None:
    """Mount the built Next.js export so the API and UI share one origin."""
    directory = _resolve_static_frontend_dir()
    if directory is None:
        return

    # SPA-style fallback: any non-API path that doesn't match a static file
    # serves index.html so the Next.js client router takes over.
    index_file = directory / "index.html"

    @app.get("/", include_in_schema=False)
    async def _index():  # pragma: no cover - trivial
        return FileResponse(index_file)

    # Mount the static asset tree last so /api/* routes still take priority.
    app.mount(
        "/",
        StaticFiles(directory=directory, html=True),
        name="frontend",
    )


app = create_app()
_mount_static_frontend(app)
