"""Prompt templates and structured payload formatting for AI providers.

These are intentionally plain strings, providers can adapt as needed.
The helpers at the bottom of the file turn an :class:`AIContext` into a
human-readable text block — sending the schema as nested JSON inside a
size-capped envelope reliably loses the table the user asked about, so
every provider funnels through these formatters instead.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from rednotebook.ai.base import AIContext

# Char budget for the user-content payload sent to the LLM. Conservative
# enough to fit comfortably in Anthropic / OpenAI 200k context windows
# while still letting Ollama hosts with smaller contexts work. The
# formatter degrades gracefully — schema first, then truncates from the
# tail of the table list when the budget is exhausted.
USER_PAYLOAD_MAX_CHARS = 24_000

SQL_GENERATION_SYSTEM = (
    "You are RedNotebook AI's SQL assistant. Your job is to generate the "
    "single best SQL statement that answers the user's request, using ONLY "
    "the schema printed in the AVAILABLE SCHEMA section of the user "
    "message. Never produce destructive statements (INSERT / UPDATE / "
    "DELETE / DROP / TRUNCATE / ALTER / MERGE / GRANT / REVOKE / CALL / "
    "EXECUTE).\n\n"
    "How to choose a table:\n"
    "  1. The AVAILABLE SCHEMA section lists tables ordered by relevance to "
    "     the user's prompt — scan the top of the list first. The "
    "     full qualified name is given (catalog.schema.name).\n"
    "  2. Match the user's noun ('customers', 'orders', 'subscriptions') "
    "     against table names, including singular/plural variants and "
    "     underscored variants ('customer_profile', 'order_items'). Prefer "
    "     the most canonical (shortest, plainest) match.\n"
    "  3. When a join is needed, use the obvious foreign-key column "
    "     conventions you can see in the schema (id, *_id, *_uuid). If a "
    "     join column isn't visible, say so with CLARIFY rather than "
    "     guessing.\n\n"
    "How to write the SQL (complex queries):\n"
    "  - Use CTEs (WITH …) to layer multi-step logic; one CTE per "
    "    conceptual step. Avoid pyramid-of-nested-subselects.\n"
    "  - Always qualify columns when joining ('o.customer_id', not "
    "    'customer_id').\n"
    "  - Use window functions (ROW_NUMBER, RANK, LAG, SUM OVER) instead of "
    "    self-joins when the engine supports them (most modern dialects do).\n"
    "  - Apply filters as early as possible; aggregate after filtering.\n"
    "  - Handle NULLs explicitly (COALESCE, IS NULL, NULLIF) when totals / "
    "    rates depend on them.\n"
    "  - Cast strings to dates with the dialect's preferred function "
    "    (DATE() / TO_DATE() / CAST(… AS DATE) — pick the one that matches "
    "    context.dialect).\n"
    "  - Add LIMIT only when the user asked for a top-N preview; never for "
    "    aggregations the user wants in full.\n"
    "  - Format for humans: uppercase keywords, one column per line in "
    "    SELECT, indent CTE bodies. Add a single short comment on top "
    "    summarising what the query returns.\n\n"
    "Ambiguity rule:\n"
    "  - If multiple plausible tables match (e.g. 'users' vs 'user_profiles'), "
    "    a metric is undefined (revenue net or gross?), a time range is "
    "    missing (last 30 days? current month?), or a join column isn't "
    "    obvious — DO NOT guess. Return exactly one line:\n"
    "        CLARIFY: <one short question>\n"
    "  - Use CLARIFY at most once per turn. The user will reply and you "
    "    will get another shot.\n\n"
    "Output rule:\n"
    "  - Otherwise return ONLY the SQL (no prose, no markdown fences, no "
    "    'Here is the query', no JSON, no commentary).\n"
    "  - Treat CONVERSATION HISTORY as prior turns; the user's latest "
    "    message takes precedence."
)

SQL_EXPLAIN_SYSTEM = (
    "Explain the SQL clearly to a data analyst. Cover: what it returns, the joins, "
    "the filters, and any performance concerns. Use 4-6 short bullets."
)

SQL_OPTIMIZE_SYSTEM = (
    "You are a senior query optimizer for warehouse SQL engines (Trino, "
    "Snowflake, BigQuery, Postgres, DuckDB, Redshift). Rewrite the user's "
    "SQL so it runs faster and reads less data while producing the EXACT "
    "same rows in the same order (or document why an ORDER BY change is "
    "safe). Use the dialect in context.dialect when set; otherwise stay "
    "ANSI-compatible.\n\n"
    "Apply these optimizations whenever they're safe and applicable:\n"
    "  1. Predicate pushdown — move WHERE filters into the deepest "
    "     subquery / CTE that defines the column. Push partition / cluster "
    "     keys (date, region, tenant_id) below joins so the scanner can "
    "     prune partitions and files.\n"
    "  2. Replace SELECT * with an explicit column list limited to columns "
    "     actually consumed downstream. Reduces shuffle + serialization.\n"
    "  3. Filter early, aggregate later. Move HAVING clauses to WHERE when "
    "     the predicate doesn't reference an aggregate.\n"
    "  4. Eliminate redundant subqueries / DISTINCT / ORDER BY in inner "
    "     scopes that the outer query overrides.\n"
    "  5. Prefer EXISTS over IN (subquery) for large semi-joins. Prefer "
    "     window functions over self-joins for ranking / per-group "
    "     calculations. Prefer COUNT(*) over COUNT(col) when col is "
    "     non-nullable.\n"
    "  6. Reorder joins so the smallest filtered relation is on the build "
    "     side; convert cross joins with post-filter into proper inner "
    "     joins on the key.\n"
    "  7. For Trino/Iceberg/BigQuery, surface APPROX_DISTINCT(...) when "
    "     the user's query is exploratory and an exact distinct count "
    "     isn't required (only when the original used COUNT(DISTINCT)).\n"
    "  8. Use UNION ALL instead of UNION when the inputs are provably "
    "     disjoint or duplicates are acceptable.\n"
    "  9. Add LIMIT when the original lacks one and the result is "
    "     obviously exploratory (TOP-N / sample); never add LIMIT to "
    "     aggregations or correctness-critical reads.\n"
    " 10. Refactor correlated subqueries into LEFT JOIN + GROUP BY when "
    "     the engine wouldn't decorrelate them automatically.\n\n"
    "Constraints:\n"
    "  - Never change semantics. If a rewrite changes results, leave the "
    "    original SQL alone for that piece.\n"
    "  - Do not invent identifiers. Only use columns / tables that exist "
    "    in the input SQL or in context.\n"
    "  - Return ONLY the optimized SQL (no prose, no markdown fences, no "
    "    diff). If no safe optimization applies, return the original SQL "
    "    verbatim."
)

RESULT_SUMMARY_SYSTEM = (
    "You are a senior data analyst delivering insights to a business stakeholder. "
    "You are given a SQL query, its schema, a small sample of rows, and "
    "aggregated stats. Reason from the actual values — never invent numbers, "
    "never describe the SQL, never restate the schema.\n\n"
    "Return strict Markdown using these headings:\n"
    "## Headline\n"
    "One sentence with the single most important takeaway. Include a specific "
    "number from the data (top value, total, %, delta).\n\n"
    "## Key findings\n"
    "3–5 bullets. Each bullet must reference at least one concrete value or "
    "ranked entity from the rows/stats (e.g. \"orders peaked at 1,284 on "
    "2025-03-04\", \"Customer #14 accounts for 38% of revenue\"). No filler.\n\n"
    "## Anomalies & risks\n"
    "1–3 bullets on outliers, nulls, skew, suspicious values, or data-quality "
    "issues. If there are no obvious issues, say so explicitly in one line.\n\n"
    "## Suggested next questions\n"
    "2–3 follow-up queries the analyst could run to deepen the analysis. Phrase "
    "each as a question, not SQL.\n\n"
    "Rules: do not output a preamble, do not output JSON, do not output "
    "\"Here's a summary\". Keep the whole answer under 250 words."
)

INFOGRAPHIC_BRIEF_SYSTEM = (
    "Produce an infographic brief (title, summary, key metrics, 3-5 insights, "
    "recommended charts, narrative, caveats) for the given query result."
)

CHART_SUGGESTION_SYSTEM = (
    "Suggest a single chart that best visualizes this data. Choose from: "
    "line, bar, stacked_bar, area, scatter, pie, donut, heatmap, histogram, "
    "box, time_series, kpi, table."
)


# ---------------------------------------------------------------------------
# Structured payload formatters
# ---------------------------------------------------------------------------
def _qualify(catalog: str | None, schema: str | None, name: str) -> str:
    parts = [p for p in (catalog, schema, name) if p]
    return ".".join(parts)


def _format_columns(columns: list[dict[str, str]] | list, max_cols: int = 30) -> str:
    if not columns:
        return ""
    out: list[str] = []
    for col in columns[:max_cols]:
        if isinstance(col, dict):
            name = str(col.get("name", ""))
            dtype = str(col.get("data_type", "")).strip()
        else:
            name = str(getattr(col, "name", ""))
            dtype = str(getattr(col, "data_type", "")).strip()
        if not name:
            continue
        out.append(f"{name} {dtype}".strip())
    extra = len(columns) - max_cols
    if extra > 0:
        out.append(f"… +{extra} more columns")
    return ", ".join(out)


def format_schema_block(context: AIContext, max_chars: int = 16_000) -> str:
    """Render the schema portion of the context as scannable plain text.

    Lists tables in the order they appear in ``context.available_tables``
    (the frontend ranks by prompt relevance), with one fully-qualified
    table per line and an inline column summary. Falls back to the active
    table's columns when no candidate list is provided. Caps total output
    at ``max_chars`` so the schema can't crowd out the user request.
    """
    lines: list[str] = []
    used = 0

    def add(line: str) -> bool:
        nonlocal used
        if used + len(line) + 1 > max_chars:
            return False
        lines.append(line)
        used += len(line) + 1
        return True

    if context.dialect:
        add(f"Dialect: {context.dialect}")
    if context.catalog or context.schema_name:
        scope = ".".join(p for p in (context.catalog, context.schema_name) if p)
        add(f"Active scope: {scope}")

    tables = context.available_tables or []
    if tables:
        add(f"\nAvailable tables (top {len(tables)}, ranked by relevance):")
        for t in tables:
            qual = _qualify(t.catalog, t.schema_name, t.name)
            cols = _format_columns(t.columns)
            line = f"- {qual}" + (f"  ({cols})" if cols else "")
            if not add(line):
                add("- … (additional tables omitted — ask CLARIFY to inspect more)")
                break
    elif context.schemas:
        add("\nColumns in the active table:")
        for col in context.schemas[:60]:
            name = col.get("name", "")
            dtype = col.get("data_type", "")
            nullable = col.get("nullable", True)
            add(f"  - {name} {dtype}{'' if nullable else ' NOT NULL'}")

    if context.business_terms:
        add("\nBusiness glossary:")
        for k, v in list(context.business_terms.items())[:20]:
            add(f"  - {k}: {v}")

    if context.sample_rows:
        add("\nSample rows (privacy-safe subset):")
        for row in context.sample_rows[:5]:
            kv = ", ".join(f"{k}={_short(v)}" for k, v in list(row.items())[:8])
            if not add(f"  - {kv}"):
                break

    return "\n".join(lines)


def _short(value) -> str:  # type: ignore[no-untyped-def]
    s = "" if value is None else str(value)
    return s if len(s) <= 40 else s[:37] + "…"


def format_history_block(context: AIContext) -> str:
    if not context.history:
        return ""
    lines = ["CONVERSATION HISTORY:"]
    for turn in context.history[-12:]:
        role = (
            "USER"
            if getattr(turn, "role", "user") == "user"
            else "ASSISTANT"
        )
        content = (getattr(turn, "content", "") or "").strip()
        if len(content) > 600:
            content = content[:580] + "…"
        lines.append(f"[{role}] {content}")
    return "\n".join(lines)


def format_generate_sql_payload(prompt: str, context: AIContext) -> str:
    """Compose the user-message body for ``generate_sql``.

    Order is intentional: schema first (the model needs it to ground every
    decision), then conversation, then the actual request — the most
    important instruction is last so it isn't overshadowed by long
    schemas, which mirrors how the Anthropic / OpenAI chat models attend
    to prompts in practice.
    """
    parts = ["AVAILABLE SCHEMA:", format_schema_block(context, max_chars=18_000)]
    history = format_history_block(context)
    if history:
        parts += ["", history]
    parts += ["", "USER REQUEST:", prompt.strip()]
    payload = "\n".join(parts)
    if len(payload) > USER_PAYLOAD_MAX_CHARS:
        payload = payload[: USER_PAYLOAD_MAX_CHARS - 64] + "\n\n[truncated]"
    return payload


def format_sql_with_context(sql: str, context: AIContext) -> str:
    """Compose the user-message body for explain / optimize calls."""
    parts = ["AVAILABLE SCHEMA:", format_schema_block(context, max_chars=12_000)]
    parts += ["", "SQL:", sql.strip()]
    payload = "\n".join(parts)
    if len(payload) > USER_PAYLOAD_MAX_CHARS:
        payload = payload[: USER_PAYLOAD_MAX_CHARS - 64] + "\n\n[truncated]"
    return payload
