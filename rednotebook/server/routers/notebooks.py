"""Notebook CRUD endpoints (file-backed JSON)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from rednotebook.notebook.models import Notebook, new_notebook
from rednotebook.notebook.storage import NotebookStorage
from rednotebook.server.dependencies import notebook_storage_dep
from rednotebook.server.schemas import (
    CreateNotebookFileRequest,
    NotebookListItem,
    NotebookListResponse,
    NotebookResponse,
    SaveNotebookResponse,
)

router = APIRouter()


@router.post("", response_model=NotebookResponse)
def create_notebook(
    request: CreateNotebookFileRequest,
    storage: NotebookStorage = Depends(notebook_storage_dep),
) -> NotebookResponse:
    notebook = new_notebook(request.title)
    storage.save(notebook)
    return NotebookResponse(notebook=notebook)


@router.get("", response_model=NotebookListResponse)
def list_notebooks(
    storage: NotebookStorage = Depends(notebook_storage_dep),
) -> NotebookListResponse:
    items = [NotebookListItem(**item) for item in storage.list_notebooks()]
    return NotebookListResponse(notebooks=items)


@router.get("/{notebook_id}", response_model=NotebookResponse)
def get_notebook(
    notebook_id: str,
    storage: NotebookStorage = Depends(notebook_storage_dep),
) -> NotebookResponse:
    try:
        return NotebookResponse(notebook=storage.load(notebook_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{notebook_id}", response_model=SaveNotebookResponse)
def save_notebook(
    notebook_id: str,
    notebook: Notebook,
    storage: NotebookStorage = Depends(notebook_storage_dep),
) -> SaveNotebookResponse:
    if notebook.id != notebook_id:
        raise HTTPException(status_code=400, detail="Notebook id mismatch")
    path = storage.save(notebook)
    return SaveNotebookResponse(ok=True, notebook_id=notebook.id, path=str(path))


@router.delete("/{notebook_id}")
def delete_notebook(
    notebook_id: str,
    storage: NotebookStorage = Depends(notebook_storage_dep),
):
    return {"ok": storage.delete(notebook_id)}
