"""Local notebook persistence (JSON files)."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from rednotebook.notebook.models import Notebook


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Not JSON serializable: {type(value).__name__}")


def save_notebook(notebook: Notebook, path: str | Path) -> Path:
    """Serialize a notebook to JSON on disk."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = notebook.model_dump(mode="json")
    target.write_text(json.dumps(payload, indent=2, default=_json_default), encoding="utf-8")
    return target


def load_notebook(path: str | Path) -> Notebook:
    """Load a notebook from disk."""
    source = Path(path)
    if not source.exists():
        raise FileNotFoundError(f"Notebook not found: {source}")
    data = json.loads(source.read_text(encoding="utf-8"))
    return Notebook.model_validate(data)


class NotebookStorage:
    """Convenience wrapper that manages a directory of notebook files."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def path_for(self, notebook_id: str) -> Path:
        return self.base_dir / f"{notebook_id}.json"

    def save(self, notebook: Notebook) -> Path:
        return save_notebook(notebook, self.path_for(notebook.id))

    def load(self, notebook_id: str) -> Notebook:
        return load_notebook(self.path_for(notebook_id))

    def list_notebooks(self) -> list[dict[str, str]]:
        """List notebook files with title + id."""
        out: list[dict[str, str]] = []
        for path in sorted(self.base_dir.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
                out.append(
                    {
                        "id": payload.get("id", path.stem),
                        "title": payload.get("metadata", {}).get("title", path.stem),
                        "path": str(path),
                    }
                )
            except Exception:
                continue
        return out

    def delete(self, notebook_id: str) -> bool:
        target = self.path_for(notebook_id)
        if target.exists():
            target.unlink()
            return True
        return False
