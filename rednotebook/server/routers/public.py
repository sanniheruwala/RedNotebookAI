"""Unauthenticated public endpoints.

The only route here today is ``GET /published/{token}`` — anyone with the
share token can view a published notebook snapshot. This is the entire
point of the publish feature, so it lives outside the auth-protected
``/api`` namespace.

Tokens are 22-character URL-safe random strings (16 bytes of entropy);
guessing one is infeasible. The response sets ``X-Robots-Tag: noindex``
so accidentally-shared links don't end up in search engines.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse

from rednotebook.notebook.publish_store import PublishStore
from rednotebook.server.dependencies import publish_store_dep

router = APIRouter()


@router.get("/published/{token}", response_class=HTMLResponse)
def view_published(
    token: str,
    publishes: PublishStore = Depends(publish_store_dep),
) -> HTMLResponse:
    record = publishes.find(token)
    if record is None:
        raise HTTPException(status_code=404, detail="Published notebook not found")
    target = Path(record.path)
    if not target.exists():
        # Manifest says the snapshot exists but the file is gone (manual
        # delete, partial revoke). Return a 404 rather than a stale shell.
        raise HTTPException(status_code=404, detail="Snapshot file missing")
    return HTMLResponse(
        content=target.read_text(encoding="utf-8"),
        headers={
            "X-Robots-Tag": "noindex",
            "Cache-Control": "public, max-age=300",
        },
    )
