"""Execute SQL cells against a connector, applying the SQL guard first."""

from __future__ import annotations

from dataclasses import dataclass

from rednotebook.connectors.base import BaseConnector, QueryResult
from rednotebook.security.sql_guard import SQLGuardResult, SQLGuardVerdict, check_sql


@dataclass(frozen=True)
class CellExecution:
    """Outcome of running a SQL cell."""

    guard: SQLGuardResult
    result: QueryResult | None
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.result is not None and self.error is None


def run_sql(
    sql: str,
    connector: BaseConnector,
    *,
    limit: int | None = None,
    allow_write_queries: bool = False,
    confirm_write: bool = False,
) -> CellExecution:
    """Run SQL with the safety guard applied.

    - BLOCKED → never executes.
    - WARN → executes only if ``confirm_write`` is also True.
    - ALLOWED → executes.
    """
    guard = check_sql(sql, allow_write_queries=allow_write_queries)
    if guard.verdict is SQLGuardVerdict.BLOCKED:
        return CellExecution(guard=guard, result=None, error="; ".join(guard.reasons))
    if guard.verdict is SQLGuardVerdict.WARN and not confirm_write:
        return CellExecution(
            guard=guard,
            result=None,
            error="Write query requires explicit confirmation",
        )
    try:
        result = connector.run_query(sql, limit=limit)
        return CellExecution(guard=guard, result=result)
    except Exception as exc:  # pragma: no cover - depends on remote server
        return CellExecution(guard=guard, result=None, error=str(exc))
