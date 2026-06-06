"""Append-only daily audit log.

One JSONL file per UTC date under ``base_dir/YYYY-MM-DD.jsonl``. Designed
for ops debugging and incident response, not analytics; if you need
analytics, replay these into a real warehouse.
"""

from __future__ import annotations

import json
import threading
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


@dataclass
class AuditEvent:
    """One row in the audit log."""

    action: str
    ts: str = field(default_factory=lambda: datetime.now(UTC).isoformat())
    user_id: str | None = None
    user_email: str | None = None
    ok: bool = True
    target: str | None = None
    ip: str | None = None
    details: dict[str, Any] = field(default_factory=dict)

    def to_json(self) -> str:
        return json.dumps(asdict(self), default=str, separators=(",", ":"))


class AuditLog:
    """Threadsafe append-only audit log writer + tail reader."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()

    def _path_for(self, when: datetime) -> Path:
        return self.base_dir / f"{when.strftime('%Y-%m-%d')}.jsonl"

    def record(self, event: AuditEvent) -> None:
        """Append a single event. Best-effort: swallows any IO error."""
        try:
            path = self._path_for(datetime.now(UTC))
            line = event.to_json() + "\n"
            with self._lock, path.open("a", encoding="utf-8") as f:
                f.write(line)
        except Exception:
            return

    def tail(
        self,
        *,
        limit: int = 200,
        action_filter: str | None = None,
        user_id_filter: str | None = None,
    ) -> list[dict[str, Any]]:
        """Return the most-recent ``limit`` events across recent log files."""
        files = sorted(self.base_dir.glob("*.jsonl"), reverse=True)
        out: list[dict[str, Any]] = []
        for path in files:
            try:
                lines = path.read_text(encoding="utf-8").splitlines()
            except Exception:
                continue
            for raw in reversed(lines):
                if not raw.strip():
                    continue
                try:
                    row = json.loads(raw)
                except Exception:
                    continue
                if action_filter and row.get("action") != action_filter:
                    continue
                if user_id_filter and row.get("user_id") != user_id_filter:
                    continue
                out.append(row)
                if len(out) >= limit:
                    return out
        return out
