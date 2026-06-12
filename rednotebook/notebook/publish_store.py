"""Persistent store of published notebook snapshots.

Each publish mints a URL-safe token and writes the rendered HTML to
``{publish_dir}/{token}.html``. Token → metadata mappings live in a tiny
JSON manifest so listings, revocation, and "is this notebook already
published?" lookups don't need to scan the whole directory.

Multi-user note: the manifest scopes by ``user_id`` so two users on the
same instance never collide tokens or see each other's listings.
"""

from __future__ import annotations

import datetime as _dt
import json
import secrets
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any

_MANIFEST_NAME = "manifest.json"
_TOKEN_BYTES = 16  # → 22-char URL-safe token, plenty of entropy


@dataclass(frozen=True)
class PublishedRecord:
    token: str
    notebook_id: str
    user_id: str
    title: str
    created_at: str
    path: str


class PublishStore:
    """Disk-backed store for published HTML snapshots."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._manifest_path = self.base_dir / _MANIFEST_NAME

    # ----- Manifest IO ------------------------------------------------------
    def _read_manifest(self) -> dict[str, Any]:
        if not self._manifest_path.exists():
            return {"records": []}
        try:
            return json.loads(self._manifest_path.read_text(encoding="utf-8"))
        except Exception:
            # Corrupt manifest shouldn't take down publishing — start fresh
            # and let the corrupt file get backed up out of the way.
            backup = self._manifest_path.with_suffix(".bak")
            try:
                self._manifest_path.rename(backup)
            except Exception:
                pass
            return {"records": []}

    def _write_manifest(self, data: dict[str, Any]) -> None:
        tmp = self._manifest_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.replace(self._manifest_path)

    # ----- Public API -------------------------------------------------------
    def publish(
        self,
        *,
        user_id: str,
        notebook_id: str,
        title: str,
        html: str,
    ) -> PublishedRecord:
        """Write the HTML snapshot, return the published record."""
        token = secrets.token_urlsafe(_TOKEN_BYTES)
        target = self.base_dir / f"{token}.html"
        target.write_text(html, encoding="utf-8")
        rec = PublishedRecord(
            token=token,
            notebook_id=notebook_id,
            user_id=user_id,
            title=title,
            created_at=_dt.datetime.now(_dt.UTC).isoformat(timespec="seconds"),
            path=str(target),
        )
        with self._lock:
            data = self._read_manifest()
            data.setdefault("records", []).append(
                {
                    "token": rec.token,
                    "notebook_id": rec.notebook_id,
                    "user_id": rec.user_id,
                    "title": rec.title,
                    "created_at": rec.created_at,
                    "path": rec.path,
                }
            )
            self._write_manifest(data)
        return rec

    def find(self, token: str) -> PublishedRecord | None:
        with self._lock:
            data = self._read_manifest()
        for r in data.get("records", []):
            if r.get("token") == token:
                return PublishedRecord(**r)
        return None

    def list_for_user(self, user_id: str) -> list[PublishedRecord]:
        with self._lock:
            data = self._read_manifest()
        return [
            PublishedRecord(**r)
            for r in data.get("records", [])
            if r.get("user_id") == user_id
        ]

    def list_for_notebook(
        self,
        *,
        user_id: str,
        notebook_id: str,
    ) -> list[PublishedRecord]:
        return [
            r
            for r in self.list_for_user(user_id)
            if r.notebook_id == notebook_id
        ]

    def revoke(self, *, user_id: str, token: str) -> bool:
        """Delete the snapshot and its manifest entry.

        Returns True when the record was removed, False when nothing
        matched (already revoked / never existed / wrong user). The
        ``user_id`` check stops a token leak from being weaponised
        against another user's publishes.
        """
        with self._lock:
            data = self._read_manifest()
            before = data.get("records", [])
            kept: list[dict[str, Any]] = []
            removed: dict[str, Any] | None = None
            for r in before:
                if r.get("token") == token and r.get("user_id") == user_id:
                    removed = r
                    continue
                kept.append(r)
            if removed is None:
                return False
            data["records"] = kept
            self._write_manifest(data)
        try:
            Path(removed["path"]).unlink(missing_ok=True)
        except Exception:
            # Stale manifest entry is fine — the listing is correct now.
            pass
        return True
