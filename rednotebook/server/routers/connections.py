"""Connection-related endpoints."""

from __future__ import annotations

import time

from fastapi import APIRouter

from rednotebook.server.dependencies import build_trino_connector
from rednotebook.server.schemas import TestConnectionResponse, TrinoConnectionPayload

router = APIRouter()


@router.post("/test", response_model=TestConnectionResponse)
def test_connection(payload: TrinoConnectionPayload) -> TestConnectionResponse:
    connector = build_trino_connector(payload)
    started = time.monotonic()
    try:
        ok = connector.test_connection()
        elapsed = time.monotonic() - started
        return TestConnectionResponse(
            ok=ok,
            message="Connection successful" if ok else "Connection failed",
            duration_seconds=elapsed,
        )
    except Exception as exc:
        return TestConnectionResponse(
            ok=False,
            message=f"Connection error: {exc}",
            duration_seconds=time.monotonic() - started,
        )
