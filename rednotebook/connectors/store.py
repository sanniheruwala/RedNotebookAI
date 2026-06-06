"""Server-side, per-user, encrypted store for saved connections.

The full connection config (host, port, password, headers, ...) is
encrypted at rest with Fernet. Only the non-sensitive metadata (name,
host, catalog, last_tested_at) is returned to the API; the secret bytes
are only decrypted inside the request handler that actually opens the
connection.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from threading import RLock
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from rednotebook.auth.encryption import decrypt, encrypt


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uid() -> str:
    return uuid.uuid4().hex


class StoredConnection(BaseModel):
    id: str = Field(default_factory=_uid)
    user_id: str
    name: str
    connector_type: str = "trino"
    host: str = ""
    catalog: str | None = None
    schema_name: str | None = None
    encrypted_config: str  # Fernet ciphertext of the raw config JSON
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)
    last_tested_at: datetime | None = None
    last_test_ok: bool | None = None

    model_config = ConfigDict(extra="ignore")


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Not JSON serializable: {type(value).__name__}")


class ConnectionStore:
    """File-backed connection store, scoped to one user directory."""

    def __init__(self, base_dir: str | Path, secret_key: str) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._path = self.base_dir / "connections.json"
        self._lock = RLock()
        self._secret_key = secret_key

    # ----- IO helpers -------------------------------------------------------
    def _read(self) -> list[dict[str, Any]]:
        if not self._path.exists():
            return []
        return json.loads(self._path.read_text(encoding="utf-8"))

    def _write(self, items: list[dict[str, Any]]) -> None:
        self._path.write_text(
            json.dumps(items, indent=2, default=_json_default),
            encoding="utf-8",
        )

    # ----- CRUD -------------------------------------------------------------
    def list_for_user(self, user_id: str) -> list[StoredConnection]:
        return [
            StoredConnection.model_validate(c)
            for c in self._read()
            if c.get("user_id") == user_id
        ]

    def get(self, user_id: str, connection_id: str) -> StoredConnection | None:
        for c in self._read():
            if c.get("user_id") == user_id and c.get("id") == connection_id:
                return StoredConnection.model_validate(c)
        return None

    def add(
        self,
        *,
        user_id: str,
        name: str,
        connector_type: str,
        config: dict[str, Any],
        host: str = "",
        catalog: str | None = None,
        schema_name: str | None = None,
    ) -> StoredConnection:
        ciphertext = encrypt(self._secret_key, json.dumps(config))
        record = StoredConnection(
            user_id=user_id,
            name=name,
            connector_type=connector_type,
            host=host,
            catalog=catalog,
            schema_name=schema_name,
            encrypted_config=ciphertext,
        )
        with self._lock:
            items = self._read()
            items.append(record.model_dump(mode="json"))
            self._write(items)
        return record

    def update(
        self,
        user_id: str,
        connection_id: str,
        *,
        name: str | None = None,
        config: dict[str, Any] | None = None,
        host: str | None = None,
        catalog: str | None = None,
        schema_name: str | None = None,
        last_tested_at: datetime | None = None,
        last_test_ok: bool | None = None,
    ) -> StoredConnection:
        with self._lock:
            items = self._read()
            for i, c in enumerate(items):
                if c.get("user_id") == user_id and c.get("id") == connection_id:
                    record = StoredConnection.model_validate(c)
                    patch: dict[str, Any] = {"updated_at": _utcnow()}
                    if name is not None:
                        patch["name"] = name
                    if host is not None:
                        patch["host"] = host
                    if catalog is not None:
                        patch["catalog"] = catalog
                    if schema_name is not None:
                        patch["schema_name"] = schema_name
                    if config is not None:
                        patch["encrypted_config"] = encrypt(
                            self._secret_key, json.dumps(config)
                        )
                    if last_tested_at is not None:
                        patch["last_tested_at"] = last_tested_at
                    if last_test_ok is not None:
                        patch["last_test_ok"] = last_test_ok
                    updated = record.model_copy(update=patch)
                    items[i] = updated.model_dump(mode="json")
                    self._write(items)
                    return updated
        raise KeyError(f"Connection not found: {connection_id}")

    def delete(self, user_id: str, connection_id: str) -> bool:
        with self._lock:
            items = self._read()
            before = len(items)
            items = [
                c
                for c in items
                if not (
                    c.get("user_id") == user_id and c.get("id") == connection_id
                )
            ]
            if len(items) == before:
                return False
            self._write(items)
            return True

    def decrypt_config(self, record: StoredConnection) -> dict[str, Any]:
        return json.loads(decrypt(self._secret_key, record.encrypted_config))
