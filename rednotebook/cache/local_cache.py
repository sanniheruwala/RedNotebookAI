"""Disk-backed result cache (Parquet via pyarrow; JSON for metadata)."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from rednotebook.connectors.base import ColumnInfo, QueryResult


def _hash_sql(sql: str, connection_name: str | None) -> str:
    h = hashlib.sha256()
    h.update((connection_name or "").encode("utf-8"))
    h.update(b"\x00")
    h.update(sql.encode("utf-8"))
    return h.hexdigest()[:24]


class LocalResultCache:
    """A tiny content-addressed cache for query results."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _paths(self, key: str) -> tuple[Path, Path]:
        return self.base_dir / f"{key}.json", self.base_dir / f"{key}.parquet"

    def put(self, sql: str, result: QueryResult, *, connection_name: str | None = None) -> str:
        key = _hash_sql(sql, connection_name)
        meta_path, data_path = self._paths(key)
        meta = {
            "key": key,
            "connection_name": connection_name,
            "sql": sql,
            "columns": [c.model_dump() for c in result.columns],
            "row_count": result.row_count,
            "duration_seconds": result.duration_seconds,
            "truncated": result.truncated,
            "stored_at": datetime.now(UTC).isoformat(),
        }
        meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        try:
            df = result.to_dataframe()
            df.to_parquet(data_path, index=False)
        except Exception:
            # Pyarrow/pandas may be unavailable in a degraded environment.
            data_path.write_text(
                json.dumps(result.rows, default=str), encoding="utf-8"
            )
        return key

    def get(self, sql: str, *, connection_name: str | None = None) -> QueryResult | None:
        key = _hash_sql(sql, connection_name)
        meta_path, data_path = self._paths(key)
        if not meta_path.exists() or not data_path.exists():
            return None
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        rows: list[dict[str, Any]]
        try:
            import pandas as pd  # noqa: WPS433

            df = pd.read_parquet(data_path)
            rows = df.to_dict(orient="records")
        except Exception:
            rows = json.loads(data_path.read_text(encoding="utf-8"))
        columns = [ColumnInfo.model_validate(c) for c in meta.get("columns", [])]
        return QueryResult(
            columns=columns,
            rows=rows,
            row_count=meta.get("row_count", len(rows)),
            duration_seconds=meta.get("duration_seconds", 0.0),
            truncated=meta.get("truncated", False),
            sql=sql,
            metadata={"cached_at": meta.get("stored_at")},
        )
