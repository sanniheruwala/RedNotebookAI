"""Process-wide registry of in-flight queries that can be cancelled.

Every ``run_query`` call that comes from the HTTP layer is tagged with a
``query_id`` minted by the client. The connector registers a tiny cancel
callback (DuckDB ``interrupt``, Trino cursor ``cancel``, Postgres
``pg_cancel_backend(pid)``…) keyed by the id before it begins executing,
and unregisters it on completion. The Stop button POSTs to
``/api/query/cancel/{query_id}`` which fires the callback from a different
thread — that's how each engine actually gets a chance to abort.

Threading: every entry point uses a single ``threading.Lock`` so register /
unregister / cancel are atomic. Callbacks are invoked *outside* the lock
to avoid the engine's own internal locking deadlocking with ours.
"""

from __future__ import annotations

import logging
import threading
from collections.abc import Callable
from contextlib import contextmanager
from dataclasses import dataclass

_log = logging.getLogger(__name__)


@dataclass
class _Entry:
    cancel_fn: Callable[[], None]
    label: str


class QueryRegistry:
    """Thread-safe map of query_id → cancel callback."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._entries: dict[str, _Entry] = {}

    def register(self, query_id: str, cancel_fn: Callable[[], None], *, label: str = "") -> None:
        if not query_id:
            return
        with self._lock:
            self._entries[query_id] = _Entry(cancel_fn=cancel_fn, label=label)

    def unregister(self, query_id: str) -> None:
        if not query_id:
            return
        with self._lock:
            self._entries.pop(query_id, None)

    def cancel(self, query_id: str) -> bool:
        """Invoke the cancel callback for ``query_id``, if registered.

        Returns True if a callback was found and called without raising;
        False if there was no such id (already finished / never registered)
        or the callback itself threw.
        """
        with self._lock:
            entry = self._entries.pop(query_id, None)
        if entry is None:
            return False
        try:
            entry.cancel_fn()
        except Exception as exc:
            _log.warning(
                "Cancel callback for query_id=%s (%s) raised: %s",
                query_id,
                entry.label,
                exc,
            )
            return False
        return True

    @contextmanager
    def track(self, query_id: str | None, cancel_fn: Callable[[], None] | None, *, label: str = ""):
        """Context-manager helper for the common register / unregister pair."""
        if query_id and cancel_fn is not None:
            self.register(query_id, cancel_fn, label=label)
        try:
            yield
        finally:
            if query_id:
                self.unregister(query_id)

    def size(self) -> int:
        with self._lock:
            return len(self._entries)


_REGISTRY = QueryRegistry()


def get_registry() -> QueryRegistry:
    return _REGISTRY
