"""Server-side encrypted connection storage (per user).

Connections are stored Fernet-encrypted on disk and only decrypted on
explicit owner request via POST {id}/load. List/update/delete views never
expose secrets. Supports both Trino and DuckDB via the discriminated
ConnectionPayload union.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from rednotebook.auth.models import User
from rednotebook.connectors.store import ConnectionStore, StoredConnection
from rednotebook.server.dependencies import (
    build_connector,
    connection_store_dep,
    require_user,
)
from rednotebook.server.schemas import (
    ConnectionPayload,
    TestConnectionResponse,
)

router = APIRouter()


class ConnectionPublic(BaseModel):
    id: str
    name: str
    connector_type: str
    host: str
    catalog: str | None
    schema_name: str | None
    created_at: datetime
    updated_at: datetime
    last_tested_at: datetime | None
    last_test_ok: bool | None

    @classmethod
    def from_record(cls, record: StoredConnection) -> ConnectionPublic:
        return cls(
            id=record.id,
            name=record.name,
            connector_type=record.connector_type,
            host=record.host,
            catalog=record.catalog,
            schema_name=record.schema_name,
            created_at=record.created_at,
            updated_at=record.updated_at,
            last_tested_at=record.last_tested_at,
            last_test_ok=record.last_test_ok,
        )


class CreateConnectionRequest(BaseModel):
    name: str
    config: ConnectionPayload = Field(discriminator="connector_type")


class UpdateConnectionRequest(BaseModel):
    name: str | None = None
    config: ConnectionPayload | None = Field(default=None, discriminator="connector_type")


# ----- Helpers ---------------------------------------------------------------
def _summary_from_payload(payload: ConnectionPayload) -> dict[str, Any]:
    """Pull the non-secret summary fields we want to expose in listings."""
    if payload.connector_type == "duckdb":
        return {
            "host": payload.database,  # repurpose: "host" column shows db path
            "catalog": None,
            "schema_name": None,
        }
    return {
        "host": payload.host,
        "catalog": payload.catalog,
        "schema_name": payload.schema_name,
    }


def _payload_from_record(
    record: StoredConnection, store: ConnectionStore
) -> ConnectionPayload:
    """Decrypt the stored config and re-validate as a discriminated union."""
    raw = store.decrypt_config(record)
    # Backfill connector_type for legacy entries that pre-date the union.
    raw.setdefault("connector_type", record.connector_type or "trino")
    from rednotebook.server.schemas import (
        DuckDBConnectionPayload,
        TrinoConnectionPayload,
    )

    if raw["connector_type"] == "duckdb":
        return DuckDBConnectionPayload.model_validate(raw)
    return TrinoConnectionPayload.model_validate(raw)


# ----- Endpoints -------------------------------------------------------------
@router.get("", response_model=list[ConnectionPublic])
def list_connections(
    user: User = Depends(require_user),
    store: ConnectionStore = Depends(connection_store_dep),
) -> list[ConnectionPublic]:
    return [ConnectionPublic.from_record(c) for c in store.list_for_user(user.id)]


@router.post("", response_model=ConnectionPublic)
def create_connection(
    payload: CreateConnectionRequest,
    user: User = Depends(require_user),
    store: ConnectionStore = Depends(connection_store_dep),
) -> ConnectionPublic:
    summary = _summary_from_payload(payload.config)
    record = store.add(
        user_id=user.id,
        name=payload.name.strip() or "Untitled connection",
        connector_type=payload.config.connector_type,
        config=payload.config.model_dump(mode="json"),
        host=summary["host"],
        catalog=summary["catalog"],
        schema_name=summary["schema_name"],
    )
    return ConnectionPublic.from_record(record)


@router.put("/{connection_id}", response_model=ConnectionPublic)
def update_connection(
    connection_id: str,
    payload: UpdateConnectionRequest,
    user: User = Depends(require_user),
    store: ConnectionStore = Depends(connection_store_dep),
) -> ConnectionPublic:
    summary = (
        _summary_from_payload(payload.config) if payload.config else {}
    )
    try:
        updated = store.update(
            user.id,
            connection_id,
            name=payload.name,
            config=payload.config.model_dump(mode="json") if payload.config else None,
            host=summary.get("host"),
            catalog=summary.get("catalog"),
            schema_name=summary.get("schema_name"),
        )
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return ConnectionPublic.from_record(updated)


@router.delete("/{connection_id}")
def delete_connection(
    connection_id: str,
    user: User = Depends(require_user),
    store: ConnectionStore = Depends(connection_store_dep),
) -> dict[str, bool]:
    if not store.delete(user.id, connection_id):
        raise HTTPException(status_code=404, detail="Connection not found")
    return {"ok": True}


@router.post("/{connection_id}/load")
def load_connection(
    connection_id: str,
    user: User = Depends(require_user),
    store: ConnectionStore = Depends(connection_store_dep),
) -> dict[str, Any]:
    """Return the decrypted inline config for the owner.

    Used by the UI to populate the connection dialog from a saved
    connection. Owner-only; the request is authenticated and the
    encrypted payload only lives on disk.
    """
    record = store.get(user.id, connection_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    payload = _payload_from_record(record, store)
    return payload.model_dump(mode="json")


@router.post("/{connection_id}/test", response_model=TestConnectionResponse)
def test_connection(
    connection_id: str,
    user: User = Depends(require_user),
    store: ConnectionStore = Depends(connection_store_dep),
) -> TestConnectionResponse:
    record = store.get(user.id, connection_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Connection not found")
    payload = _payload_from_record(record, store)
    connector = build_connector(payload)
    started = time.monotonic()
    try:
        ok = connector.test_connection()
        elapsed = time.monotonic() - started
        store.update(
            user.id,
            connection_id,
            last_tested_at=datetime.now(UTC),
            last_test_ok=ok,
        )
        return TestConnectionResponse(
            ok=ok,
            message="Connection successful" if ok else "Connection failed",
            duration_seconds=elapsed,
        )
    except Exception as exc:
        store.update(
            user.id,
            connection_id,
            last_tested_at=datetime.now(UTC),
            last_test_ok=False,
        )
        return TestConnectionResponse(
            ok=False,
            message=f"Connection error: {exc}",
            duration_seconds=time.monotonic() - started,
        )


