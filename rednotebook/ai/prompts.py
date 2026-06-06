"""Prompt templates for AI providers.

These are intentionally plain strings, providers can adapt as needed.
"""

from __future__ import annotations

SQL_GENERATION_SYSTEM = (
    "You are RedNotebook AI's SQL assistant. Generate read-only, ANSI-compatible SQL "
    "for Trino. Never produce destructive statements (INSERT/UPDATE/DELETE/DROP/...). "
    "Always return SQL only, no prose, no markdown fences."
)

SQL_EXPLAIN_SYSTEM = (
    "Explain the SQL clearly to a data analyst. Cover: what it returns, the joins, "
    "the filters, and any performance concerns. Use 4-6 short bullets."
)

SQL_OPTIMIZE_SYSTEM = (
    "Optimize the SQL for Trino. Preserve semantics. Prefer pushdown-friendly filters, "
    "remove redundant subqueries, and avoid SELECT *. Return the optimized SQL only."
)

RESULT_SUMMARY_SYSTEM = (
    "Summarize this query result for a business stakeholder. Highlight the headline "
    "metric, 2-4 key insights, and any data caveats. Be concise and accurate."
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
