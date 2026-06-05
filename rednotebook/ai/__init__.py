"""AI provider abstraction."""

from rednotebook.ai.base import (
    AIContext,
    AIProvider,
    ChartSuggestion,
    DataFrameSchema,
    InfographicBrief,
    InfographicContext,
    ResultContext,
)
from rednotebook.ai.context_builder import build_ai_context, build_result_context
from rednotebook.ai.mock import MockAIProvider
from rednotebook.ai.registry import get_provider, list_providers, register_provider

__all__ = [
    "AIContext",
    "AIProvider",
    "ChartSuggestion",
    "DataFrameSchema",
    "InfographicBrief",
    "InfographicContext",
    "MockAIProvider",
    "ResultContext",
    "build_ai_context",
    "build_result_context",
    "get_provider",
    "list_providers",
    "register_provider",
]
