"""Per-user store for drag-drop file uploads.

Each user gets ``local_data/uploads/<user-id>/`` with:

  * ``manifest.json`` — table_name → file metadata
  * ``<uuid>.<ext>``   — the raw files we hand to DuckDB

The point of the store is to let an analyst drag ``customers.csv`` onto
the notebook canvas and immediately write ``SELECT * FROM customers``.
DuckDB does the rest via the views the connector registers on every query.
"""

from __future__ import annotations

import datetime as _dt
import json
import re
import threading
import uuid
from collections.abc import Iterable
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import IO, Any

_MANIFEST_NAME = "manifest.json"

#: Extensions we accept. DuckDB ships native readers for each; the
#: registration helper in the DuckDB connector maps extension → reader fn.
SUPPORTED_EXTENSIONS: tuple[str, ...] = (
    "csv",
    "tsv",
    "txt",
    "json",
    "jsonl",
    "ndjson",
    "parquet",
)

#: Hard cap so a single drop can't fill the disk. 200 MB lines up with
#: DuckDB's "comfortable in-memory" threshold for the analyst use case.
MAX_UPLOAD_BYTES = 200 * 1024 * 1024


@dataclass(frozen=True)
class UploadedFile:
    """One row of the manifest."""

    id: str
    table_name: str
    original_name: str
    extension: str
    size_bytes: int
    uploaded_at: str
    path: str
    columns: list[dict[str, str]] = field(default_factory=list)


class UploadStoreError(Exception):
    """Raised for user-facing upload failures (bad name, oversized, etc)."""


class UploadStore:
    """Disk-backed user-scoped file store."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._manifest_path = self.base_dir / _MANIFEST_NAME

    # ----- Manifest IO ------------------------------------------------------
    def _read_manifest(self) -> dict[str, Any]:
        if not self._manifest_path.exists():
            return {"files": []}
        try:
            return json.loads(self._manifest_path.read_text(encoding="utf-8"))
        except Exception:
            return {"files": []}

    def _write_manifest(self, data: dict[str, Any]) -> None:
        tmp = self._manifest_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
        tmp.replace(self._manifest_path)

    # ----- Helpers ----------------------------------------------------------
    @staticmethod
    def sanitize_table_name(raw: str, *, fallback: str = "uploaded") -> str:
        """Turn an arbitrary filename into a SQL-safe view name.

        Rules: lowercase, alnum + underscore, leading digit gets prefixed,
        empty stem falls back to ``fallback``. Long names truncate at 63
        characters (matches Postgres's identifier limit, which is the
        strictest of any engine we support).
        """
        stem = Path(raw).stem.lower()
        cleaned = re.sub(r"[^a-z0-9_]+", "_", stem).strip("_")
        if not cleaned:
            cleaned = fallback
        if cleaned[0].isdigit():
            cleaned = f"_{cleaned}"
        return cleaned[:63]

    def _unique_table_name(self, desired: str, *, ignore_id: str | None = None) -> str:
        existing = {
            f.table_name
            for f in self.list_files()
            if ignore_id is None or f.id != ignore_id
        }
        if desired not in existing:
            return desired
        i = 2
        while f"{desired}_{i}" in existing:
            i += 1
        return f"{desired}_{i}"

    # ----- Mutations --------------------------------------------------------
    def add(
        self,
        *,
        original_name: str,
        stream: IO[bytes],
        table_name: str | None = None,
    ) -> UploadedFile:
        """Persist ``stream`` to disk and register it in the manifest.

        Streams in 1 MiB chunks so even a 200 MB upload doesn't double
        memory. Validates extension + size before retaining the file —
        a rejected upload leaves no temp on disk.
        """
        ext = Path(original_name).suffix.lstrip(".").lower()
        if ext not in SUPPORTED_EXTENSIONS:
            raise UploadStoreError(
                f"Unsupported file type {ext!r}. "
                f"Supported: {', '.join(SUPPORTED_EXTENSIONS)}."
            )

        desired = self.sanitize_table_name(table_name or original_name)
        chosen = self._unique_table_name(desired)
        file_id = uuid.uuid4().hex
        target = self.base_dir / f"{file_id}.{ext}"

        size = 0
        try:
            with target.open("wb") as fh:
                while True:
                    chunk = stream.read(1024 * 1024)
                    if not chunk:
                        break
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise UploadStoreError(
                            f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB upload limit"
                        )
                    fh.write(chunk)
        except Exception:
            # Clean partial upload so disk doesn't fill up on bad retries.
            try:
                target.unlink(missing_ok=True)
            except Exception:
                pass
            raise

        record = UploadedFile(
            id=file_id,
            table_name=chosen,
            original_name=original_name,
            extension=ext,
            size_bytes=size,
            uploaded_at=_dt.datetime.now(_dt.UTC).isoformat(timespec="seconds"),
            path=str(target),
        )
        with self._lock:
            data = self._read_manifest()
            data.setdefault("files", []).append(asdict(record))
            self._write_manifest(data)
        return record

    def remove(self, file_id: str) -> bool:
        with self._lock:
            data = self._read_manifest()
            keep: list[dict[str, Any]] = []
            removed: dict[str, Any] | None = None
            for r in data.get("files", []):
                if r.get("id") == file_id:
                    removed = r
                    continue
                keep.append(r)
            if removed is None:
                return False
            data["files"] = keep
            self._write_manifest(data)
        try:
            Path(removed["path"]).unlink(missing_ok=True)
        except Exception:
            pass
        return True

    def rename(self, file_id: str, new_table_name: str) -> UploadedFile | None:
        """Rename the SQL view associated with ``file_id``."""
        cleaned = self.sanitize_table_name(new_table_name)
        chosen = self._unique_table_name(cleaned, ignore_id=file_id)
        with self._lock:
            data = self._read_manifest()
            updated: UploadedFile | None = None
            for r in data.get("files", []):
                if r.get("id") == file_id:
                    r["table_name"] = chosen
                    updated = UploadedFile(**r)
                    break
            if updated is None:
                return None
            self._write_manifest(data)
        return updated

    # ----- Reads ------------------------------------------------------------
    def list_files(self) -> list[UploadedFile]:
        with self._lock:
            data = self._read_manifest()
        return [UploadedFile(**r) for r in data.get("files", [])]

    def iter_files(self) -> Iterable[UploadedFile]:
        return iter(self.list_files())

    def find(self, file_id: str) -> UploadedFile | None:
        for f in self.list_files():
            if f.id == file_id:
                return f
        return None
