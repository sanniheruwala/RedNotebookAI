"""Infographic generation endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response

from rednotebook.ai.base import DataFrameSchema, InfographicContext
from rednotebook.ai.errors import AIProviderError
from rednotebook.ai.registry import get_provider
from rednotebook.config.settings import get_settings
from rednotebook.knowledge.models import Infographic
from rednotebook.knowledge.store import InternalKnowledgeStore
from rednotebook.server.dependencies import knowledge_store_dep
from rednotebook.server.schemas import (
    InfographicGenerateRequest,
    InfographicGenerateResponse,
    InfographicRenderRequest,
)
from rednotebook.visualization.infographic import (
    export_infographic,
    render_infographic_html,
    render_infographic_image_data_url,
    render_infographic_svg,
)
from rednotebook.visualization.templates import list_templates

router = APIRouter()


@router.get("/templates")
def templates() -> dict[str, list[dict[str, str]]]:
    return {"templates": list_templates()}


@router.post("/generate", response_model=InfographicGenerateResponse)
def generate(
    request: InfographicGenerateRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> InfographicGenerateResponse:
    settings = get_settings()
    provider = get_provider(settings)
    schema = DataFrameSchema(
        columns=[{"name": c.name, "data_type": c.data_type} for c in request.columns],
        row_count=len(request.sample_rows),
    )
    context = InfographicContext(
        template=request.template,
        title_hint=request.title_hint,
        sql=request.sql,
        schema=schema,
        aggregated_stats=request.aggregated_stats,
        sample_rows=request.sample_rows if settings.ai_allow_sample_rows else [],
        notes=request.notes,
    )
    try:
        brief = provider.generate_infographic_brief(context)
    except AIProviderError as exc:
        model = f" / {exc.model}" if exc.model else ""
        raise HTTPException(
            status_code=502,
            detail=f"{exc.provider}{model}: {exc}",
        ) from exc
    html_doc = render_infographic_html(brief, template=request.template)
    svg_doc = render_infographic_svg(
        brief, template=request.template, source_label=request.title_hint
    )
    image_data_url = render_infographic_image_data_url(
        brief, template=request.template, source_label=request.title_hint
    )

    export_path: str | None = None
    if request.persist and request.notebook_id:
        try:
            store.get_notebook(request.notebook_id)
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        infographic = Infographic(
            notebook_id=request.notebook_id,
            title=brief.title,
            narrative=brief.narrative,
            layout_config={"template": request.template, "layout": brief.layout},
            chart_configs=[c.model_dump() for c in brief.recommended_charts],
        )
        out_dir = Path(settings.exports_dir) / "infographics"
        target = out_dir / f"{infographic.id}.html"
        export_infographic(
            brief,
            target,
            template=request.template,
            source_label=request.title_hint,
        )
        infographic = infographic.model_copy(update={"export_paths": [str(target)]})
        store.add_infographic(infographic)
        export_path = str(target)

    return InfographicGenerateResponse(
        brief=brief,
        html=html_doc,
        image=image_data_url,
        svg=svg_doc,
        export_path=export_path,
    )


_EXPORT_MIME = {"pdf": "application/pdf", "png": "image/png"}


@router.post("/render")
def render(payload: InfographicRenderRequest) -> Response:
    """Rasterise an infographic's HTML to PDF or PNG via headless Chromium.

    The HTML is rendered self-contained — no network requests. Returns the
    binary bytes with a Content-Disposition hint so the browser saves it
    directly. Requires the ``[exports]`` extra (Playwright + Chromium).
    """
    from rednotebook.visualization.render_browser import render_html

    fmt = payload.format
    try:
        data = render_html(payload.html, fmt)
    except RuntimeError as exc:  # missing playwright SDK / browser binary
        raise HTTPException(status_code=501, detail=str(exc)) from exc
    except Exception as exc:  # pragma: no cover - rendering failures
        raise HTTPException(
            status_code=500, detail=f"Render failed: {exc}"
        ) from exc

    filename = payload.filename or f"infographic.{fmt}"
    return Response(
        content=data,
        media_type=_EXPORT_MIME[fmt],
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
