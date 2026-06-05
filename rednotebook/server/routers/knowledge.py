"""Knowledge notebook endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from rednotebook.knowledge.models import KnowledgeSource, SourceType
from rednotebook.knowledge.store import InternalKnowledgeStore
from rednotebook.server.dependencies import knowledge_store_dep
from rednotebook.server.schemas import (
    AddSourceRequest,
    CreateNotebookRequest,
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
