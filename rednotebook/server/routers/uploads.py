"""Drag-drop file uploads.

The router writes raw files to the per-user uploads dir and the DuckDB
connector turns each one into a queryable view on next query (see
:mod:`rednotebook.connectors.duckdb`). End-to-end flow:

  1. POST /api/files/upload  → multipart, returns the new table_name
  2. GET  /api/files          → list current files for the sidebar
  3. PATCH /api/files/{id}   → rename the view
  4. DELETE /api/files/{id}  → drop the file + manifest entry

Auth-protected; the uploads dir is scoped per user via the dep injector.
"""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from rednotebook.server.dependencies import upload_store_dep
from rednotebook.uploads.store import (
    SUPPORTED_EXTENSIONS,
    UploadStore,
    UploadStoreError,
)

router = APIRouter()


class UploadedFilePayload(BaseModel):
    id: str
    table_name: str
    original_name: str
    extension: str
    size_bytes: int
    uploaded_at: str
    path: str
    columns: list[dict[str, str]] = []


class UploadListResponse(BaseModel):
    files: list[UploadedFilePayload]
    supported_extensions: list[str] = list(SUPPORTED_EXTENSIONS)


class RenameUploadRequest(BaseModel):
    table_name: str


@router.post("/upload", response_model=UploadedFilePayload)
async def upload_file(
    file: UploadFile = File(...),
    table_name: str | None = Form(default=None),
    store: UploadStore = Depends(upload_store_dep),
) -> UploadedFilePayload:
    """Save the uploaded file to disk and register it as a queryable view."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename missing from upload")
    try:
        record = store.add(
            original_name=file.filename,
            stream=file.file,
            table_name=table_name,
        )
    except UploadStoreError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return UploadedFilePayload(**asdict(record))


@router.get("", response_model=UploadListResponse)
def list_uploads(
    store: UploadStore = Depends(upload_store_dep),
) -> UploadListResponse:
    return UploadListResponse(
        files=[UploadedFilePayload(**asdict(f)) for f in store.list_files()],
    )


@router.patch("/{file_id}", response_model=UploadedFilePayload)
def rename_upload(
    file_id: str,
    payload: RenameUploadRequest,
    store: UploadStore = Depends(upload_store_dep),
) -> UploadedFilePayload:
    rec = store.rename(file_id, payload.table_name)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"No upload with id {file_id}")
    return UploadedFilePayload(**asdict(rec))


@router.delete("/{file_id}")
def delete_upload(
    file_id: str,
    store: UploadStore = Depends(upload_store_dep),
) -> dict[str, bool]:
    return {"ok": store.remove(file_id)}
