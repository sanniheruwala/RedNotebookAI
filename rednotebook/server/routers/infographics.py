"""Infographic generation endpoints."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from rednotebook.ai.base import DataFrameSchema, InfographicContext
from rednotebook.ai.registry import get_provider
from rednotebook.config.settings import get_settings
from rednotebook.knowledge.models import Infographic
from rednotebook.knowledge.store import InternalKnowledgeStore
from rednotebook.server.dependencies import knowledge_store_dep
from rednotebook.server.schemas import (
    InfographicGenerateRequest,
    InfographicGenerateResponse,
)
from rednotebook.visualization.infographic import (
    export_infographic,
    render_infographic_html,
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
    brief = provider.generate_infographic_brief(context)
    html_doc = render_infographic_html(brief, template=request.template)

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
        export_path=export_path,
    )
