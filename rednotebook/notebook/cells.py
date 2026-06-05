"""Cell-type enumeration."""

from __future__ import annotations

from enum import StrEnum


class CellType(StrEnum):
    """Supported notebook cell types."""

    MARKDOWN = "markdown"
    SQL = "sql"
    AI_PROMPT = "ai_prompt"
    VISUALIZATION = "visualization"
    KNOWLEDGE_NOTE = "knowledge_note"
