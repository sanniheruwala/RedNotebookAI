"""FastAPI application entry point."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from rednotebook import __version__
from rednotebook.config.settings import get_settings
from rednotebook.server.routers import (
    ai,
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
    app = FastAPI(
        title=settings.app_name,
        version=__version__,
        description="Open-source AI data notebook for Trino and modern data platforms.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(connections.router, prefix="/api/connections", tags=["connections"])
    app.include_router(metadata.router, prefix="/api/metadata", tags=["metadata"])
    app.include_router(query.router, prefix="/api/query", tags=["query"])
    app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
    app.include_router(charts.router, prefix="/api/charts", tags=["charts"])
    app.include_router(knowledge.router, prefix="/api/knowledge", tags=["knowledge"])
    app.include_router(infographics.router, prefix="/api/infographics", tags=["infographics"])
    app.include_router(notebooks.router, prefix="/api/notebooks", tags=["notebooks"])
    return app


app = create_app()
