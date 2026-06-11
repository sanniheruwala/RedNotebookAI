"""Notebook CRUD endpoints (file-backed JSON with git-backed history)."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException

from rednotebook.auth.models import User
from rednotebook.notebook.git_store import NotebookGitStore
from rednotebook.notebook.models import Notebook, new_notebook
from rednotebook.notebook.storage import NotebookStorage
from rednotebook.server.dependencies import (
    notebook_git_store_dep,
    notebook_storage_dep,
    require_user,
)
from rednotebook.server.schemas import (
    CreateNotebookFileRequest,
    NotebookHistoryItem,
    NotebookHistoryResponse,
    NotebookListItem,
    NotebookListResponse,
    NotebookResponse,
    RestoreNotebookRequest,
    SaveNotebookResponse,
)

router = APIRouter()


def _commit_author(user: User) -> tuple[str, str]:
    """Pull a sensible author tuple from the request user.

    Falls back to a generic identity so the commit succeeds even when the
    user store has no email (e.g. local-only mode).
    """
    name = (getattr(user, "name", None) or getattr(user, "email", None) or "rednotebook")
    email = getattr(user, "email", None) or "notebooks@rednotebook.local"
    return str(name), str(email)


def _commit_after_save(
    git: NotebookGitStore,
    path,
    *,
    notebook: Notebook,
    user: User,
    reason: str,
) -> str | None:
    title = (notebook.metadata.title or "").strip() or "Untitled"
    author_name, author_email = _commit_author(user)
    message = f"{reason}: {title} ({notebook.id[:8]})"
    return git.commit(
        path,
        message,
        author_name=author_name,
        author_email=author_email,
    )


@router.post("", response_model=NotebookResponse)
def create_notebook(
    request: CreateNotebookFileRequest,
    storage: NotebookStorage = Depends(notebook_storage_dep),
    git: NotebookGitStore = Depends(notebook_git_store_dep),
    user: User = Depends(require_user),
) -> NotebookResponse:
    notebook = new_notebook(request.title)
    path = storage.save(notebook)
    _commit_after_save(git, path, notebook=notebook, user=user, reason="create")
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
    git: NotebookGitStore = Depends(notebook_git_store_dep),
    user: User = Depends(require_user),
) -> SaveNotebookResponse:
    if notebook.id != notebook_id:
        raise HTTPException(status_code=400, detail="Notebook id mismatch")
    path = storage.save(notebook)
    sha = _commit_after_save(
        git, path, notebook=notebook, user=user, reason="autosave"
    )
    return SaveNotebookResponse(
        ok=True,
        notebook_id=notebook.id,
        path=str(path),
        commit_sha=sha,
    )


@router.delete("/{notebook_id}")
def delete_notebook(
    notebook_id: str,
    storage: NotebookStorage = Depends(notebook_storage_dep),
    git: NotebookGitStore = Depends(notebook_git_store_dep),
    user: User = Depends(require_user),
):
    path = storage.path_for(notebook_id)
    ok = storage.delete(notebook_id)
    if ok:
        author_name, author_email = _commit_author(user)
        git.commit(
            path,
            f"delete: {notebook_id[:8]}",
            author_name=author_name,
            author_email=author_email,
        )
    return {"ok": ok}


# ---------------------------------------------------------------------------
# Git-backed history
# ---------------------------------------------------------------------------
@router.get(
    "/{notebook_id}/history",
    response_model=NotebookHistoryResponse,
)
def list_history(
    notebook_id: str,
    limit: int = 50,
    storage: NotebookStorage = Depends(notebook_storage_dep),
    git: NotebookGitStore = Depends(notebook_git_store_dep),
) -> NotebookHistoryResponse:
    """Return commits affecting this notebook, newest first."""
    path = storage.path_for(notebook_id)
    commits = git.history(path, limit=limit)
    return NotebookHistoryResponse(
        notebook_id=notebook_id,
        commits=[
            NotebookHistoryItem(
                sha=c.sha,
                short_sha=c.short_sha,
                timestamp=c.timestamp,
                iso_timestamp=c.iso_timestamp,
                author_name=c.author_name,
                author_email=c.author_email,
                message=c.message,
            )
            for c in commits
        ],
    )


@router.get("/{notebook_id}/history/{sha}", response_model=NotebookResponse)
def get_notebook_at_commit(
    notebook_id: str,
    sha: str,
    storage: NotebookStorage = Depends(notebook_storage_dep),
    git: NotebookGitStore = Depends(notebook_git_store_dep),
) -> NotebookResponse:
    """Load the notebook as it existed at ``sha`` — read-only preview."""
    path = storage.path_for(notebook_id)
    raw = git.read_at(path, sha)
    if raw is None:
        raise HTTPException(
            status_code=404,
            detail=f"No version of {notebook_id} at commit {sha}",
        )
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Snapshot at {sha} is not valid JSON: {exc}",
        ) from exc
    return NotebookResponse(notebook=Notebook.model_validate(data))


@router.post("/{notebook_id}/restore", response_model=SaveNotebookResponse)
def restore_notebook(
    notebook_id: str,
    payload: RestoreNotebookRequest,
    storage: NotebookStorage = Depends(notebook_storage_dep),
    git: NotebookGitStore = Depends(notebook_git_store_dep),
    user: User = Depends(require_user),
) -> SaveNotebookResponse:
    """Roll the notebook back to ``payload.sha`` and commit the restore."""
    path = storage.path_for(notebook_id)
    raw = git.read_at(path, payload.sha)
    if raw is None:
        raise HTTPException(
            status_code=404,
            detail=f"No version of {notebook_id} at commit {payload.sha}",
        )
    # Validate the snapshot before we let the restore mutate disk.
    try:
        data = json.loads(raw)
        notebook = Notebook.model_validate(data)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Snapshot at {payload.sha} is invalid: {exc}",
        ) from exc
    storage.save(notebook)
    author_name, author_email = _commit_author(user)
    new_sha = git.restore(
        path,
        payload.sha,
        author_name=author_name,
        author_email=author_email,
        message=(
            f"restore {notebook.metadata.title or 'Untitled'} "
            f"({notebook_id[:8]}) to {payload.sha[:7]}"
        ),
    )
    return SaveNotebookResponse(
        ok=True,
        notebook_id=notebook.id,
        path=str(path),
        commit_sha=new_sha,
    )
