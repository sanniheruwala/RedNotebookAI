"""Anthropic-backed AI provider (optional)."""

from __future__ import annotations

import json
import logging
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
from rednotebook.ai.errors import AIProviderError
from rednotebook.ai.mock import MockAIProvider
from rednotebook.ai.prompts import (
    CHART_SUGGESTION_SYSTEM,
    INFOGRAPHIC_BRIEF_SYSTEM,
    RESULT_SUMMARY_SYSTEM,
    SQL_EXPLAIN_SYSTEM,
    SQL_GENERATION_SYSTEM,
    SQL_OPTIMIZE_SYSTEM,
)
from rednotebook.ai.registry import register_provider
from rednotebook.config.settings import Settings

_log = logging.getLogger(__name__)


class AnthropicProvider(AIProvider):
    """Anthropic Claude provider.

    Errors from the API (auth, model not found, rate limit, network) are
    raised as :class:`AIProviderError` rather than swallowed. The
    previous "return empty string → fall back to mock" path silently
    masked invalid API keys and bad model names as canned mock output,
    which is the worst possible UX — the user can't tell whether the
    provider is working without reading logs.

    The mock fallback is still kept for the *chart suggestion* path
    where the deterministic recommender is the right tool.
    """

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
        except Exception as exc:
            _log.warning(
                "Anthropic API call failed (model=%s): %s", self._model, exc
            )
            raise AIProviderError(
                f"Anthropic API call failed: {exc}",
                provider=self.name,
                model=self._model,
                cause=exc,
            ) from exc
        parts = [
            block.text
            for block in response.content
            if getattr(block, "type", "") == "text"
        ]
        return "".join(parts).strip()

    def generate_sql(self, prompt: str, context: AIContext) -> str:
        return self._complete(
            SQL_GENERATION_SYSTEM,
            json.dumps({"prompt": prompt, "context": context.model_dump()}, default=str)[:8000],
        )

    def explain_sql(self, sql: str, context: AIContext) -> str:
        return self._complete(
            SQL_EXPLAIN_SYSTEM,
            json.dumps({"sql": sql, "context": context.model_dump()}, default=str)[:8000],
        )

    def optimize_sql(self, sql: str, context: AIContext) -> str:
        return self._complete(
            SQL_OPTIMIZE_SYSTEM,
            json.dumps({"sql": sql, "context": context.model_dump()}, default=str)[:8000],
        )

    def suggest_chart(
        self,
        dataframe_schema: DataFrameSchema,
        sample: list[dict[str, Any]],
    ) -> ChartSuggestion:
        # Ask Claude to pick a chart shape based on the column types and a
        # truncated sample. Fall back to the deterministic recommender if
        # the model returns something unparseable — that keeps Auto-suggest
        # from looking like a no-op when the schema is small / obvious.
        payload = json.dumps(
            {
                "schema": dataframe_schema.model_dump(),
                "sample": sample[:10],
            },
            default=str,
        )[:8000]
        text = self._complete(
            CHART_SUGGESTION_SYSTEM
            + "\nReturn strict JSON with keys: chart_type, x, y, color, "
            "aggregation, title, reason. Use null for fields that don't apply.",
            payload,
        )
        try:
            data = json.loads(text)
            return ChartSuggestion.model_validate(data)
        except Exception:
            return self._fallback.suggest_chart(dataframe_schema, sample)

    def summarize_result(self, context: ResultContext) -> str:
        return self._complete(
            RESULT_SUMMARY_SYSTEM,
            json.dumps(context.model_dump(), default=str)[:8000],
        )

    def generate_infographic_brief(
        self,
        context: InfographicContext,
    ) -> InfographicBrief:
        text = self._complete(
            INFOGRAPHIC_BRIEF_SYSTEM + "\nReturn strict JSON.",
            json.dumps(context.model_dump(), default=str)[:8000],
        )
        try:
            data = json.loads(text)
            return InfographicBrief.model_validate(data)
        except Exception:
            # If the model returned text but not parseable JSON, attach
            # the raw narrative to the deterministic fallback brief so
            # the user gets *some* signal that real AI ran.
            brief = self._fallback.generate_infographic_brief(context)
            return brief.model_copy(update={"narrative": text})


register_provider("anthropic", AnthropicProvider)
