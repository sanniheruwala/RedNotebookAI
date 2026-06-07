"""OpenAI-backed AI provider (optional)."""

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


class OpenAIProvider(AIProvider):
    """OpenAI chat completions provider.

    Errors from the API (auth, model not found, rate limit, network) are
    raised as :class:`AIProviderError` rather than swallowed. See the
    docstring on :class:`AnthropicProvider` for the rationale.
    """

    name = "openai"

    def __init__(self, settings: Settings) -> None:
        if not settings.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is not set")
        try:
            from openai import OpenAI  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError("openai package not installed") from exc
        self._client = OpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_model
        self._fallback = MockAIProvider(settings)

    def _chat(self, system: str, user: str) -> str:
        try:
            response = self._client.chat.completions.create(
                model=self._model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.1,
            )
        except Exception as exc:
            _log.warning(
                "OpenAI API call failed (model=%s): %s", self._model, exc
            )
            raise AIProviderError(
                f"OpenAI API call failed: {exc}",
                provider=self.name,
                model=self._model,
                cause=exc,
            ) from exc
        return (response.choices[0].message.content or "").strip()

    def generate_sql(self, prompt: str, context: AIContext) -> str:
        return self._chat(SQL_GENERATION_SYSTEM, _format_user_prompt(prompt, context))

    def explain_sql(self, sql: str, context: AIContext) -> str:
        return self._chat(SQL_EXPLAIN_SYSTEM, _format_sql_with_context(sql, context))

    def optimize_sql(self, sql: str, context: AIContext) -> str:
        return self._chat(SQL_OPTIMIZE_SYSTEM, _format_sql_with_context(sql, context))

    def suggest_chart(
        self,
        dataframe_schema: DataFrameSchema,
        sample: list[dict[str, Any]],
    ) -> ChartSuggestion:
        # Ask the LLM to pick a chart shape; fall back to the deterministic
        # recommender if the response is unparseable. See AnthropicProvider
        # for the rationale.
        payload = json.dumps(
            {
                "schema": dataframe_schema.model_dump(),
                "sample": sample[:10],
            },
            default=str,
        )[:8000]
        text = self._chat(
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
        payload = json.dumps(context.model_dump(), default=str)[:8000]
        return self._chat(RESULT_SUMMARY_SYSTEM, payload)

    def generate_infographic_brief(
        self,
        context: InfographicContext,
    ) -> InfographicBrief:
        payload = json.dumps(context.model_dump(), default=str)[:8000]
        text = self._chat(INFOGRAPHIC_BRIEF_SYSTEM + "\nReturn JSON.", payload)
        try:
            data = json.loads(text)
            return InfographicBrief.model_validate(data)
        except Exception:
            brief = self._fallback.generate_infographic_brief(context)
            return brief.model_copy(update={"narrative": text})


def _format_user_prompt(prompt: str, context: AIContext) -> str:
    return json.dumps({"prompt": prompt, "context": context.model_dump()}, default=str)[:8000]


def _format_sql_with_context(sql: str, context: AIContext) -> str:
    return json.dumps({"sql": sql, "context": context.model_dump()}, default=str)[:8000]


register_provider("openai", OpenAIProvider)
