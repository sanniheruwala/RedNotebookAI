"""Local (file-backed) knowledge store.

Each knowledge notebook is one JSON file under ``base_dir`` storing the
notebook metadata plus its sources and infographics. Designed to be small
and dependency-free.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from rednotebook.knowledge.models import (
    Infographic,
    KnowledgeNotebook,
    KnowledgeSource,
)


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Not JSON serializable: {type(value).__name__}")


class InternalKnowledgeStore:
    """File-backed knowledge store."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    # ----- Notebook CRUD ------------------------------------------------------
    def _path(self, notebook_id: str) -> Path:
        return self.base_dir / f"{notebook_id}.json"

    def _read(self, notebook_id: str) -> dict[str, Any]:
        path = self._path(notebook_id)
        if not path.exists():
            raise FileNotFoundError(f"Knowledge notebook not found: {notebook_id}")
        return json.loads(path.read_text(encoding="utf-8"))

    def _write(self, notebook_id: str, data: dict[str, Any]) -> None:
        path = self._path(notebook_id)
        data["notebook"]["updated_at"] = datetime.now(UTC).isoformat()
        path.write_text(
            json.dumps(data, indent=2, default=_json_default), encoding="utf-8"
        )

    def create_notebook(self, name: str, description: str | None = None) -> KnowledgeNotebook:
        notebook = KnowledgeNotebook(name=name, description=description)
        data = {
            "notebook": notebook.model_dump(mode="json"),
            "sources": [],
            "infographics": [],
        }
        self._write(notebook.id, data)
        return notebook

    def list_notebooks(self) -> list[KnowledgeNotebook]:
        notebooks: list[KnowledgeNotebook] = []
        for path in sorted(self.base_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                notebooks.append(KnowledgeNotebook.model_validate(payload["notebook"]))
            except Exception:
                continue
        return notebooks

    def get_notebook(self, notebook_id: str) -> KnowledgeNotebook:
        return KnowledgeNotebook.model_validate(self._read(notebook_id)["notebook"])

    def delete_notebook(self, notebook_id: str) -> bool:
        path = self._path(notebook_id)
        if path.exists():
            path.unlink()
            return True
        return False

    # ----- Sources ------------------------------------------------------------
    def add_source(self, source: KnowledgeSource) -> KnowledgeSource:
        data = self._read(source.notebook_id)
        data["sources"].append(source.model_dump(mode="json"))
        self._write(source.notebook_id, data)
        return source

    def list_sources(self, notebook_id: str) -> list[KnowledgeSource]:
        data = self._read(notebook_id)
        return [KnowledgeSource.model_validate(s) for s in data.get("sources", [])]

    def get_source(self, notebook_id: str, source_id: str) -> KnowledgeSource:
        for src in self.list_sources(notebook_id):
            if src.id == source_id:
                return src
        raise FileNotFoundError(f"Source not found: {source_id}")

    def delete_source(self, notebook_id: str, source_id: str) -> bool:
        data = self._read(notebook_id)
        before = len(data["sources"])
        data["sources"] = [s for s in data["sources"] if s["id"] != source_id]
        changed = len(data["sources"]) != before
        if changed:
            self._write(notebook_id, data)
        return changed

    # ----- Infographics -------------------------------------------------------
    def add_infographic(self, infographic: Infographic) -> Infographic:
        data = self._read(infographic.notebook_id)
        data["infographics"].append(infographic.model_dump(mode="json"))
        self._write(infographic.notebook_id, data)
        return infographic

    def list_infographics(self, notebook_id: str) -> list[Infographic]:
        data = self._read(notebook_id)
        return [Infographic.model_validate(i) for i in data.get("infographics", [])]
