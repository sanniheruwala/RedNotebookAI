"""Server-side connection storage endpoints (encrypted at rest).

These live under ``/api/me/connections``. The plaintext password is only
required at creation time. Subsequent calls reference connections by id;
the server decrypts on demand and never returns the raw config to the
client.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import SecretStr

from rednotebook.auth.models import User
from rednotebook.connectors.store import ConnectionStore, StoredConnection
from rednotebook.connectors.trino import TrinoConnectionConfig, TrinoConnector
from rednotebook.server.dependencies import (
    connection_store_dep,
    require_user,
)
from rednotebook.server.schemas import (
    TestConnectionResponse,
    TrinoConnectionPayload,
)

router = APIRouter()


# ----- Public-shape connection (no secrets) ----------------------------------
from pydantic import BaseModel  # noqa: E402


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
    config: TrinoConnectionPayload


class UpdateConnectionRequest(BaseModel):
    name: str | None = None
    config: TrinoConnectionPayload | None = None


# ----- Helpers ---------------------------------------------------------------
def _build_connector(payload: TrinoConnectionPayload) -> TrinoConnector:
    cfg = TrinoConnectionConfig(
        connection_name=payload.connection_name,
        connector_type="trino",
        host=payload.host,
        port=payload.port,
        scheme=payload.scheme,
        user=payload.user,
        password=SecretStr(payload.password) if payload.password else None,
        catalog=payload.catalog,
        schema=payload.schema_name,
        http_headers=payload.http_headers,
        session_properties=payload.session_properties,
        verify_ssl=payload.verify_ssl,
        ca_certificate_path=payload.ca_certificate_path,
        source=payload.source,
        timezone=payload.timezone,
        query_timeout_seconds=payload.query_timeout_seconds,
        max_preview_rows=payload.max_preview_rows,
        max_result_rows=payload.max_result_rows,
    )
    return TrinoConnector(cfg)


def _payload_from_record(
    record: StoredConnection, store: ConnectionStore
) -> TrinoConnectionPayload:
    raw = store.decrypt_config(record)
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
    record = store.add(
        user_id=user.id,
        name=payload.name.strip() or "Untitled connection",
        connector_type="trino",
        config=payload.config.model_dump(mode="json"),
        host=payload.config.host,
        catalog=payload.config.catalog,
        schema_name=payload.config.schema_name,
    )
    return ConnectionPublic.from_record(record)


@router.put("/{connection_id}", response_model=ConnectionPublic)
def update_connection(
    connection_id: str,
    payload: UpdateConnectionRequest,
    user: User = Depends(require_user),
    store: ConnectionStore = Depends(connection_store_dep),
) -> ConnectionPublic:
    try:
        updated = store.update(
            user.id,
            connection_id,
            name=payload.name,
            config=payload.config.model_dump(mode="json") if payload.config else None,
            host=payload.config.host if payload.config else None,
            catalog=payload.config.catalog if payload.config else None,
            schema_name=payload.config.schema_name if payload.config else None,
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
    connector = _build_connector(payload)
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
