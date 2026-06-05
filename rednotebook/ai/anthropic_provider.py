"""Anthropic-backed AI provider (optional)."""

from __future__ import annotations

import json
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
from rednotebook.ai.mock import MockAIProvider
from rednotebook.ai.prompts import (
    INFOGRAPHIC_BRIEF_SYSTEM,
    RESULT_SUMMARY_SYSTEM,
    SQL_EXPLAIN_SYSTEM,
    SQL_GENERATION_SYSTEM,
    SQL_OPTIMIZE_SYSTEM,
)
from rednotebook.ai.registry import register_provider
from rednotebook.config.settings import Settings


class AnthropicProvider(AIProvider):
    """Anthropic Claude provider. Falls back to mock on any error."""

    name = "anthropic"

    def __init__(self, settings: Settings) -> None:
        if not settings.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY is not set")
        try:
            import anthropic  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError("anthropic package not installed") from exc
        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model
        self._fallback = MockAIProvider(settings)

    def _complete(self, system: str, user: str) -> str:
        try:
            response = self._client.messages.create(
                model=self._model,
                max_tokens=2048,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            parts = [block.text for block in response.content if getattr(block, "type", "") == "text"]
            return "".join(parts).strip()
        except Exception:
            return ""

    def generate_sql(self, prompt: str, context: AIContext) -> str:
        text = self._complete(
            SQL_GENERATION_SYSTEM,
            json.dumps({"prompt": prompt, "context": context.model_dump()}, default=str)[:8000],
        )
        return text or self._fallback.generate_sql(prompt, context)

    def explain_sql(self, sql: str, context: AIContext) -> str:
        text = self._complete(
            SQL_EXPLAIN_SYSTEM,
            json.dumps({"sql": sql, "context": context.model_dump()}, default=str)[:8000],
        )
        return text or self._fallback.explain_sql(sql, context)

    def optimize_sql(self, sql: str, context: AIContext) -> str:
        text = self._complete(
            SQL_OPTIMIZE_SYSTEM,
            json.dumps({"sql": sql, "context": context.model_dump()}, default=str)[:8000],
        )
        return text or self._fallback.optimize_sql(sql, context)

    def suggest_chart(
        self,
        dataframe_schema: DataFrameSchema,
        sample: list[dict[str, Any]],
    ) -> ChartSuggestion:
        return self._fallback.suggest_chart(dataframe_schema, sample)

    def summarize_result(self, context: ResultContext) -> str:
        text = self._complete(
            RESULT_SUMMARY_SYSTEM,
            json.dumps(context.model_dump(), default=str)[:8000],
        )
        return text or self._fallback.summarize_result(context)

    def generate_infographic_brief(
        self,
        context: InfographicContext,
    ) -> InfographicBrief:
        text = self._complete(
            INFOGRAPHIC_BRIEF_SYSTEM + "\nReturn strict JSON.",
            json.dumps(context.model_dump(), default=str)[:8000],
        )
        if not text:
            return self._fallback.generate_infographic_brief(context)
        try:
            data = json.loads(text)
            return InfographicBrief.model_validate(data)
        except Exception:
            brief = self._fallback.generate_infographic_brief(context)
            return brief.model_copy(update={"narrative": text})


register_provider("anthropic", AnthropicProvider)
