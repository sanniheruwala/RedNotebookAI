"""Deterministic mock AI provider, works offline and in tests."""

from __future__ import annotations

from typing import Any

from rednotebook.ai.base import (
    AIContext,
    AIProvider,
    ChartSuggestion,
    DataFrameSchema,
    InfographicBrief,
    InfographicContext,
    ResultContext,
)
from rednotebook.ai.registry import register_provider


class MockAIProvider(AIProvider):
    """A safe, deterministic provider that never makes network calls."""

    name = "mock"

    def __init__(self, settings: Any = None) -> None:
        self.settings = settings

    def generate_sql(self, prompt: str, context: AIContext) -> str:
        table = _qualified_table(context) or "your_table"
        return (
            f"-- Mock SQL for prompt: {prompt[:80]}\n"
            f"SELECT *\nFROM {table}\nLIMIT 100"
        )

    def explain_sql(self, sql: str, context: AIContext) -> str:
        lines = sql.strip().splitlines()
        first = lines[0][:120] if lines else "(empty)"
        return (
            "**Mock explanation**\n\n"
            f"- The query begins with: `{first}`\n"
            "- It targets the configured catalog/schema in the context.\n"
            "- No destructive operations are present (read-only).\n"
            "- Consider adding column projections and a LIMIT for safety."
        )

    def optimize_sql(self, sql: str, context: AIContext) -> str:
        return (
            "-- Mock optimization: keep semantics; trim SELECT * and add LIMIT.\n"
            + sql.strip()
            + "\n-- Tip: filter by partition columns first when available."
        )

    def suggest_chart(
        self,
        dataframe_schema: DataFrameSchema,
        sample: list[dict[str, Any]],
    ) -> ChartSuggestion:
        from rednotebook.visualization.recommender import recommend_chart

        suggestion = recommend_chart(dataframe_schema, sample)
        return suggestion

    def summarize_result(self, context: ResultContext) -> str:
        stats = context.aggregated_stats or {}
        bullets = [f"- **Rows fetched:** {context.schema.row_count}"]
        if "row_count" in stats:
            bullets.append(f"- **Total rows analyzed:** {stats['row_count']}")
        if context.schema.columns:
            cols = ", ".join(c["name"] for c in context.schema.columns[:5])
            bullets.append(f"- **Top columns:** {cols}")
        bullets.append("- (Mock summary, connect a real AI provider for deeper insight.)")
        return "## Mock result summary\n\n" + "\n".join(bullets)

    def generate_infographic_brief(
        self,
        context: InfographicContext,
    ) -> InfographicBrief:
        schema = context.schema or DataFrameSchema()
        key_metrics: list[dict[str, Any]] = []
        if schema.row_count:
            key_metrics.append({"label": "Rows", "value": schema.row_count})
        for col in schema.columns[:3]:
            key_metrics.append({"label": col["name"], "value": col.get("data_type", "-")})

        insights = [
            "Result returned a non-empty dataset." if schema.row_count else "Result was empty.",
            f"Schema has {len(schema.columns)} columns.",
            "Mock insights, connect a real AI provider for narrative analysis.",
        ]
        chart = self.suggest_chart(schema, context.sample_rows)
        return InfographicBrief(
            title=context.title_hint or "Data Snapshot",
            summary="High-level overview of the latest query result.",
            key_metrics=key_metrics,
            insights=insights,
            recommended_charts=[chart],
            layout="stacked",
            narrative=(
                "This infographic was generated offline by the mock AI provider. "
                "Configure a real provider (OpenAI, Anthropic, or Ollama) to enrich the narrative."
            ),
            caveats=[
                "Generated without a live model, narratives are templated.",
                "Numbers reflect only the rows fetched, not necessarily all rows.",
            ],
        )


def _qualified_table(context: AIContext) -> str | None:
    parts = [p for p in (context.catalog, context.schema_name, context.table) if p]
    return ".".join(parts) if parts else None


register_provider("mock", MockAIProvider)
