"""Knowledge notebook data models."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uid() -> str:
    return uuid.uuid4().hex


class SourceType(str, Enum):
    SQL_QUERY = "sql_query"
    QUERY_RESULT = "query_result"
    CHART = "chart"
    MARKDOWN = "markdown"
    SCHEMA = "schema"
    PROFILE = "profile"
    UPLOADED_FILE = "uploaded_file"
    WEB_LINK = "web_link"
    BUSINESS_DEFINITION = "business_definition"


class KnowledgeSource(BaseModel):
    id: str = Field(default_factory=_uid)
    notebook_id: str
    source_type: SourceType
    title: str
    content: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)
    external_source_id: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)

    model_config = ConfigDict(extra="ignore")


class KnowledgeNotebook(BaseModel):
    id: str = Field(default_factory=_uid)
    name: str
    description: str | None = None
    provider_type: Literal["internal", "notebooklm_enterprise"] = "internal"
    external_notebook_id: str | None = None
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)

    model_config = ConfigDict(extra="ignore")


class Infographic(BaseModel):
    id: str = Field(default_factory=_uid)
    notebook_id: str
    title: str
    source_ids: list[str] = Field(default_factory=list)
    layout_config: dict[str, Any] = Field(default_factory=dict)
    chart_configs: list[dict[str, Any]] = Field(default_factory=list)
    narrative: str = ""
    export_paths: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utcnow)

    model_config = ConfigDict(extra="ignore")
