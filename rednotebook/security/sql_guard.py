"""SQL safety guard.

Default: read-only analytics. Write/destructive statements are blocked unless
the caller explicitly enables them via ``allow_write_queries=True``.

The guard tries to use sqlglot when available (more robust) and falls back to
a keyword scanner. Both layers are conservative — when in doubt, block.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from enum import StrEnum

# Statements that mutate or affect server state.
DANGEROUS_KEYWORDS: frozenset[str] = frozenset(
    {
        "DELETE",
        "UPDATE",
        "INSERT",
        "MERGE",
        "DROP",
        "TRUNCATE",
        "ALTER",
        "CREATE",
        "GRANT",
        "REVOKE",
        "CALL",
        "EXECUTE",
    }
)

# Statements explicitly allowed in read-only mode.
SAFE_LEADING_KEYWORDS: frozenset[str] = frozenset(
    {
        "SELECT",
        "WITH",
        "EXPLAIN",
        "SHOW",
        "DESCRIBE",
        "DESC",
        "USE",
        "VALUES",
        "TABLE",
    }
)


class SQLGuardVerdict(StrEnum):
    """Outcome of evaluating a SQL statement."""

    ALLOWED = "allowed"
    WARN = "warn"
    BLOCKED = "blocked"


@dataclass(frozen=True)
class SQLGuardResult:
    """Structured result of a guard check."""

    verdict: SQLGuardVerdict
    reasons: list[str] = field(default_factory=list)
    dangerous_keywords: list[str] = field(default_factory=list)
    statement_type: str | None = None

    @property
    def is_blocked(self) -> bool:
        return self.verdict is SQLGuardVerdict.BLOCKED

    @property
    def is_allowed(self) -> bool:
        return self.verdict is not SQLGuardVerdict.BLOCKED


_COMMENT_BLOCK = re.compile(r"/\*.*?\*/", re.DOTALL)
_COMMENT_LINE = re.compile(r"--[^\n]*")
_STRING_LITERAL = re.compile(r"'(?:''|[^'])*'")
_WORD = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\b")


def _strip_noise(sql: str) -> str:
    """Remove comments and string literals so keyword scanning isn't fooled."""
    cleaned = _COMMENT_BLOCK.sub(" ", sql)
    cleaned = _COMMENT_LINE.sub(" ", cleaned)
    cleaned = _STRING_LITERAL.sub("''", cleaned)
    return cleaned


def _leading_keyword(sql: str) -> str | None:
    cleaned = _strip_noise(sql).lstrip().lstrip("(").lstrip()
    match = _WORD.match(cleaned)
    return match.group(1).upper() if match else None


def _scan_dangerous_keywords(sql: str) -> list[str]:
    cleaned = _strip_noise(sql).upper()
    tokens = set(_WORD.findall(cleaned))
    return sorted(tokens & DANGEROUS_KEYWORDS)


def _split_statements(sql: str) -> list[str]:
    """Naive multi-statement splitter respecting string literals."""
    cleaned = _strip_noise(sql)
    parts = [s.strip() for s in cleaned.split(";")]
    return [p for p in parts if p]


def check_sql(sql: str, *, allow_write_queries: bool = False) -> SQLGuardResult:
    """Evaluate a SQL string against the safety policy.

    Args:
        sql: The SQL text. May contain comments and multiple statements.
        allow_write_queries: When True, dangerous statements yield WARN rather
            than BLOCKED. The default (False) blocks them entirely.

    Returns:
        A SQLGuardResult describing the verdict and the reasoning.
    """
    if not sql or not sql.strip():
        return SQLGuardResult(
            verdict=SQLGuardVerdict.BLOCKED,
            reasons=["Empty SQL"],
        )

    statements = _split_statements(sql)
    if len(statements) > 1:
        # Multiple statements raise the risk surface — evaluate each.
        verdicts: list[SQLGuardResult] = [
            check_sql(stmt, allow_write_queries=allow_write_queries) for stmt in statements
        ]
        blocked = [r for r in verdicts if r.is_blocked]
        if blocked:
            return SQLGuardResult(
                verdict=SQLGuardVerdict.BLOCKED,
                reasons=["Multiple statements include a blocked one"]
                + [reason for r in blocked for reason in r.reasons],
                dangerous_keywords=sorted(
                    {kw for r in blocked for kw in r.dangerous_keywords}
                ),
            )
        warn = [r for r in verdicts if r.verdict is SQLGuardVerdict.WARN]
        if warn:
            return SQLGuardResult(
                verdict=SQLGuardVerdict.WARN,
                reasons=["Multiple statements include a write statement"]
                + [reason for r in warn for reason in r.reasons],
                dangerous_keywords=sorted(
                    {kw for r in warn for kw in r.dangerous_keywords}
                ),
            )
        return SQLGuardResult(
            verdict=SQLGuardVerdict.ALLOWED,
            reasons=["All statements are read-only"],
            statement_type="MULTI",
        )

    leading = _leading_keyword(sql) or ""
    dangerous = _scan_dangerous_keywords(sql)
    sqlglot_type = _sqlglot_root_type(sql)
    statement_type = sqlglot_type or leading or None

    # If sqlglot identifies the statement as a write op, treat it as dangerous
    # even if the leading word looks safe (e.g. CTE-wrapped INSERT).
    is_write_via_sqlglot = sqlglot_type in {
        "INSERT",
        "UPDATE",
        "DELETE",
        "MERGE",
        "DROP",
        "TRUNCATE",
        "ALTER",
        "CREATE",
        "GRANT",
        "REVOKE",
        "CALL",
        "EXECUTE",
    }

    is_dangerous = bool(dangerous) or is_write_via_sqlglot

    if not is_dangerous and leading in SAFE_LEADING_KEYWORDS:
        return SQLGuardResult(
            verdict=SQLGuardVerdict.ALLOWED,
            reasons=[f"Read-only statement ({leading})"],
            statement_type=statement_type,
        )

    if not is_dangerous and leading and leading not in SAFE_LEADING_KEYWORDS:
        # Unknown leading keyword — be conservative.
        return SQLGuardResult(
            verdict=SQLGuardVerdict.BLOCKED,
            reasons=[f"Unrecognized leading keyword: {leading}"],
            statement_type=statement_type,
        )

    # Dangerous path
    reason = f"Dangerous keyword(s) detected: {', '.join(dangerous) or sqlglot_type}"
    if allow_write_queries:
        return SQLGuardResult(
            verdict=SQLGuardVerdict.WARN,
            reasons=[reason, "Writes are enabled — confirm before executing."],
            dangerous_keywords=dangerous or ([sqlglot_type] if sqlglot_type else []),
            statement_type=statement_type,
        )
    return SQLGuardResult(
        verdict=SQLGuardVerdict.BLOCKED,
        reasons=[reason, "Set ALLOW_WRITE_QUERIES=true to enable writes."],
        dangerous_keywords=dangerous or ([sqlglot_type] if sqlglot_type else []),
        statement_type=statement_type,
    )


def _sqlglot_root_type(sql: str) -> str | None:
    """Best-effort statement classification using sqlglot.

    Returns the SQLGlot expression class name (uppercased) or None when parsing
    fails or sqlglot is unavailable. Falls back gracefully — the keyword
    scanner remains the primary defense.
    """
    try:
        import sqlglot  # type: ignore[import-not-found]
    except Exception:
        return None
    try:
        parsed = sqlglot.parse(sql, read="trino")
    except Exception:
        return None
    if not parsed or parsed[0] is None:
        return None
    return type(parsed[0]).__name__.upper()
