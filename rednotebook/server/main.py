"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rednotebook import __version__
from rednotebook.config.settings import get_settings
from rednotebook.migrations.auto_namespace import run_namespace_migration
from rednotebook.server.dependencies import require_user
from rednotebook.server.routers import (
    ai,
    auth,
    charts,
    connections,
    health,
    infographics,
    knowledge,
    metadata,
    notebooks,
    query,
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

    # Auth-protected dependency. Bypassed when AUTH_ENABLED is false.
    protected = [Depends(require_user)]

    app.include_router(health.router)
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
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
    return app


app = create_app()
