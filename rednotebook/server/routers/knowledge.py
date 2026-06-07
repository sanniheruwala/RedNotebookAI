"""Knowledge notebook endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from rednotebook.ai.base import AIContext
from rednotebook.ai.errors import AIProviderError
from rednotebook.ai.registry import get_provider
from rednotebook.config.settings import get_settings
from rednotebook.knowledge.models import KnowledgeSource, SourceType
from rednotebook.knowledge.store import InternalKnowledgeStore
from rednotebook.security.secrets import mask_secrets
from rednotebook.server.dependencies import knowledge_store_dep
from rednotebook.server.schemas import (
    AddSourceRequest,
    CreateNotebookRequest,
    KnowledgeChatRequest,
    KnowledgeChatResponse,
    KnowledgeNotebookListResponse,
    KnowledgeSourceListResponse,
)

router = APIRouter()


@router.post("/notebooks")
def create_notebook(
    request: CreateNotebookRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    notebook = store.create_notebook(request.name, request.description)
    return notebook


@router.get("/notebooks", response_model=KnowledgeNotebookListResponse)
def list_notebooks(
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeNotebookListResponse:
    return KnowledgeNotebookListResponse(notebooks=store.list_notebooks())


@router.get("/notebooks/{notebook_id}")
def get_notebook(
    notebook_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    try:
        return store.get_notebook(notebook_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/notebooks/{notebook_id}")
def delete_notebook(
    notebook_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    return {"ok": store.delete_notebook(notebook_id)}


@router.post("/sources", response_model=KnowledgeSource)
def add_source(
    request: AddSourceRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeSource:
    try:
        source = KnowledgeSource(
            notebook_id=request.notebook_id,
            source_type=SourceType(request.source_type),
            title=request.title,
            content=request.content,
            metadata=request.metadata,
        )
        return store.add_source(source)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/notebooks/{notebook_id}/sources", response_model=KnowledgeSourceListResponse)
def list_sources(
    notebook_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeSourceListResponse:
    try:
        return KnowledgeSourceListResponse(sources=store.list_sources(notebook_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/notebooks/{notebook_id}/sources/{source_id}")
def delete_source(
    notebook_id: str,
    source_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    return {"ok": store.delete_source(notebook_id, source_id)}


def _source_to_context_chunk(source: KnowledgeSource) -> str:
    """Render a source as a compact text chunk for the AI prompt."""
    header = f"[{source.source_type.value.upper()}] {source.title}"
    body = mask_secrets(source.content or "")
    meta_lines: list[str] = []
    if source.source_type is SourceType.SCHEMA:
        cols = source.metadata.get("columns") or []
        if cols:
            meta_lines.append(
                "columns: "
                + ", ".join(
                    f"{c.get('name')}({c.get('data_type')})" for c in cols[:24]
                )
            )
    elif source.source_type is SourceType.QUERY_RESULT:
        rc = source.metadata.get("row_count")
        cc = source.metadata.get("column_count")
        cols = source.metadata.get("columns") or []
        if rc is not None or cc is not None:
            meta_lines.append(f"row_count={rc}, column_count={cc}")
        if cols:
            meta_lines.append(
                "columns: "
                + ", ".join(f"{c.get('name')}({c.get('data_type')})" for c in cols[:24])
            )
    elif source.source_type is SourceType.PROFILE:
        sens = source.metadata.get("sensitive_columns") or []
        if sens:
            meta_lines.append("sensitive_columns: " + ", ".join(sens))
    return "\n".join([header, *meta_lines, body]).strip()


@router.post("/chat", response_model=KnowledgeChatResponse)
def chat(
    request: KnowledgeChatRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeChatResponse:
    """Ask the AI a question grounded in the notebook's knowledge sources."""
    try:
        all_sources = store.list_sources(request.notebook_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    selected = (
        [s for s in all_sources if s.id in set(request.source_ids)]
        if request.source_ids
        else all_sources
    )

    if not selected:
        return KnowledgeChatResponse(
            answer="No knowledge sources are available yet. Add SQL, schemas, or results from cells.",
            provider="none",
            cited_source_ids=[],
        )

    settings = get_settings()
    provider = get_provider(settings)
    chunks = [_source_to_context_chunk(s) for s in selected][:12]
    grounded_prompt = (
        "You are answering a question grounded ONLY in the following knowledge sources.\n"
        "Be concise, cite source titles inline, and say 'not in the sources' if unknown.\n\n"
        f"QUESTION: {request.question}\n\n"
        "SOURCES:\n\n" + "\n\n---\n\n".join(chunks)
    )
    context = AIContext()
    try:
        answer = provider.explain_sql(grounded_prompt, context)
    except AIProviderError as exc:
        model = f" / {exc.model}" if exc.model else ""
        raise HTTPException(
            status_code=502,
            detail=f"{exc.provider}{model}: {exc}",
        ) from exc
    return KnowledgeChatResponse(
        answer=answer,
        provider=provider.name,
        cited_source_ids=[s.id for s in selected],
    )
