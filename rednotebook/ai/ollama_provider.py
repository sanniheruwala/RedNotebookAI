"""Ollama (local model) AI provider, uses urllib so it has zero new deps."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
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
    format_generate_sql_payload,
    format_sql_with_context,
)
from rednotebook.ai.registry import register_provider
from rednotebook.config.settings import Settings


class OllamaProvider(AIProvider):
    """Local-model provider via Ollama's HTTP API. Falls back to mock on error."""

    name = "ollama"

    def __init__(self, settings: Settings) -> None:
        self._base_url = (settings.ollama_base_url or "").rstrip("/")
        self._model = settings.ollama_model
        if not self._base_url:
            raise RuntimeError("OLLAMA_BASE_URL is not set")
        self._fallback = MockAIProvider(settings)

    def _chat(self, system: str, user: str) -> str:
        url = f"{self._base_url}/api/chat"
        payload = json.dumps(
            {
                "model": self._model,
                "messages": [
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                "stream": False,
            }
        ).encode("utf-8")
        request = urllib.request.Request(
            url,
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                body = json.loads(response.read().decode("utf-8"))
            return (body.get("message", {}).get("content") or "").strip()
        except (urllib.error.URLError, TimeoutError, ValueError):
            return ""

    def generate_sql(self, prompt: str, context: AIContext) -> str:
        text = self._chat(SQL_GENERATION_SYSTEM, format_generate_sql_payload(prompt, context))
        return text or self._fallback.generate_sql(prompt, context)

    def explain_sql(self, sql: str, context: AIContext) -> str:
        text = self._chat(SQL_EXPLAIN_SYSTEM, format_sql_with_context(sql, context))
        return text or self._fallback.explain_sql(sql, context)

    def optimize_sql(self, sql: str, context: AIContext) -> str:
        text = self._chat(SQL_OPTIMIZE_SYSTEM, format_sql_with_context(sql, context))
        return text or self._fallback.optimize_sql(sql, context)

    def suggest_chart(
        self,
        dataframe_schema: DataFrameSchema,
        sample: list[dict[str, Any]],
    ) -> ChartSuggestion:
        return self._fallback.suggest_chart(dataframe_schema, sample)

    def summarize_result(self, context: ResultContext) -> str:
        text = self._chat(RESULT_SUMMARY_SYSTEM, json.dumps(context.model_dump(), default=str)[:8000])
        return text or self._fallback.summarize_result(context)

    def generate_infographic_brief(
        self,
        context: InfographicContext,
    ) -> InfographicBrief:
        text = self._chat(
            INFOGRAPHIC_BRIEF_SYSTEM + "\nReturn strict JSON.",
            json.dumps(context.model_dump(), default=str)[:8000],
        )
        if not text:
            return self._fallback.generate_infographic_brief(context)
        try:
            return InfographicBrief.model_validate(json.loads(text))
        except Exception:
            brief = self._fallback.generate_infographic_brief(context)
            return brief.model_copy(update={"narrative": text})


def _payload(**kwargs: Any) -> str:
    return json.dumps(
        {k: (v.model_dump() if hasattr(v, "model_dump") else v) for k, v in kwargs.items()},
        default=str,
    )[:8000]


register_provider("ollama", OllamaProvider)
