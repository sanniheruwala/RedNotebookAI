"""Pydantic models for notebooks and cells.

Notebooks are saved as JSON. Cell unions are discriminated by ``cell_type`` so
the serialized form is stable and forward-compatible.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from rednotebook.notebook.cells import CellType


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uid() -> str:
    return uuid.uuid4().hex


class ResultArtifactRef(BaseModel):
    """Pointer to a stored result artifact (kept out-of-line for size)."""

    artifact_id: str
    row_count: int = 0
    column_count: int = 0
    duration_seconds: float = 0.0
    storage_path: str | None = None
    truncated: bool = False
    created_at: datetime = Field(default_factory=_utcnow)


class ChartConfig(BaseModel):
    """Configuration for rendering a chart from a result."""

    chart_type: str = "bar"
    x: str | None = None
    y: str | list[str] | None = None
    color: str | None = None
    aggregation: str | None = None
    title: str | None = None
    subtitle: str | None = None
    theme: str = "plotly_white"
    filters: dict[str, Any] = Field(default_factory=dict)
    options: dict[str, Any] = Field(default_factory=dict)


class _CellBase(BaseModel):
    id: str = Field(default_factory=_uid)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    model_config = ConfigDict(extra="ignore")


class MarkdownCell(_CellBase):
    cell_type: Literal[CellType.MARKDOWN] = CellType.MARKDOWN
    source: str = ""


class SQLCell(_CellBase):
    cell_type: Literal[CellType.SQL] = CellType.SQL
    connection_name: str | None = None
    sql: str = ""
    limit: int | None = None
    last_result_ref: ResultArtifactRef | None = None
    chart_config: ChartConfig | None = None
    notes: str | None = None


class AIChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str
    suggested_sql: str | None = None
    provider: str | None = None


class AIPromptCell(_CellBase):
    cell_type: Literal[CellType.AI_PROMPT] = CellType.AI_PROMPT
    prompt: str = ""
    response: str | None = None
    suggested_sql: str | None = None
    context_mode: str = "schema_and_stats"
    messages: list[AIChatMessage] = Field(default_factory=list)


class VisualizationCell(_CellBase):
    cell_type: Literal[CellType.VISUALIZATION] = CellType.VISUALIZATION
    source_cell_id: str | None = None
    chart_config: ChartConfig = Field(default_factory=ChartConfig)


class KnowledgeNoteCell(_CellBase):
    cell_type: Literal[CellType.KNOWLEDGE_NOTE] = CellType.KNOWLEDGE_NOTE
    title: str = ""
    body: str = ""
    knowledge_source_ids: list[str] = Field(default_factory=list)


Cell = Annotated[
    MarkdownCell | SQLCell | AIPromptCell | VisualizationCell | KnowledgeNoteCell,
    Field(discriminator="cell_type"),
]


class NotebookMetadata(BaseModel):
    title: str = "Untitled Notebook"
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    author: str | None = None
    schema_version: int = 1


class Notebook(BaseModel):
    """A whole notebook: metadata + ordered cells."""

    id: str = Field(default_factory=_uid)
    metadata: NotebookMetadata = Field(default_factory=NotebookMetadata)
    cells: list[Cell] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    model_config = ConfigDict(extra="ignore")

    # ----- Immutable mutation helpers ----------------------------------------
    # Every operation returns a NEW Notebook, callers must replace their handle.
    def add_cell(self, cell: Cell, *, position: int | None = None) -> Notebook:
        cells = list(self.cells)
        if position is None or position >= len(cells):
            cells.append(cell)
        else:
            cells.insert(max(0, position), cell)
        return self.model_copy(update={"cells": cells, "updated_at": _utcnow()})

    def remove_cell(self, cell_id: str) -> Notebook:
        cells = [c for c in self.cells if c.id != cell_id]
        return self.model_copy(update={"cells": cells, "updated_at": _utcnow()})

    def replace_cell(self, cell: Cell) -> Notebook:
        cells = [(cell if c.id == cell.id else c) for c in self.cells]
        return self.model_copy(update={"cells": cells, "updated_at": _utcnow()})

    def move_cell(self, cell_id: str, direction: Literal["up", "down"]) -> Notebook:
        cells = list(self.cells)
        idx = next((i for i, c in enumerate(cells) if c.id == cell_id), None)
        if idx is None:
            return self
        target = idx - 1 if direction == "up" else idx + 1
        if target < 0 or target >= len(cells):
            return self
        cells[idx], cells[target] = cells[target], cells[idx]
        return self.model_copy(update={"cells": cells, "updated_at": _utcnow()})

    def duplicate_cell(self, cell_id: str) -> Notebook:
        idx = next((i for i, c in enumerate(self.cells) if c.id == cell_id), None)
        if idx is None:
            return self
        original = self.cells[idx]
        # model_copy with new id/timestamps preserves immutability
        copy = original.model_copy(
            update={"id": _uid(), "created_at": _utcnow(), "updated_at": _utcnow()}
        )
        cells = list(self.cells)
        cells.insert(idx + 1, copy)
        return self.model_copy(update={"cells": cells, "updated_at": _utcnow()})

    def get_cell(self, cell_id: str) -> Cell | None:
        return next((c for c in self.cells if c.id == cell_id), None)


_DEFAULT_WELCOME = """# {title}

A blank notebook to query, explore, and narrate.

## How to use this notebook

- **SQL cell** — write a query and hit `Run` (or `⌘↵`). Add one from the inserter below.
- **Markdown cell** — narrate your analysis. `#`, `##`, `-`, fenced code, tables — all supported.
- **Ask AI cell** — describe what you want in plain English; refine in a chat thread; promote any reply to a SQL cell.
- **Chart cell** — visualize the result of any SQL cell.

## Tips

- Drag the handle on the left of any cell to reorder.
- `⌘K` opens the command palette.
- The **Knowledge** drawer (top-right) holds notebook-grounded chat + infographics.

> Delete this cell once you're ready to start your own story."""


def new_notebook(title: str = "Untitled Notebook") -> Notebook:
    """Create a fresh notebook with a markdown welcome cheat-sheet."""
    welcome = MarkdownCell(source=_DEFAULT_WELCOME.format(title=title))
    return Notebook(metadata=NotebookMetadata(title=title), cells=[welcome])
