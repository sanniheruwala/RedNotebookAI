"""Migration: move un-namespaced notebooks/knowledge into the default user.

Before path 2, notebook + knowledge JSON files lived directly under
`local_data/notebooks/` and `local_data/knowledge/`. Now everything is
namespaced by user id. This module moves any orphaned files to the
"default" user's directory on first boot. Safe to re-run, no-op if there is
already a user directory present.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from rednotebook.auth.models import DEFAULT_USER_ID

MARKER_FILENAME = ".namespace-migrated"


def _migrate_dir(base_dir: Path, target_user_id: str) -> int:
    """Move *.json files under base_dir into base_dir/<target_user_id>/."""
    if not base_dir.exists():
        return 0
    target = base_dir / target_user_id
    marker = base_dir / MARKER_FILENAME
    if marker.exists():
        return 0
    moved = 0
    target.mkdir(parents=True, exist_ok=True)
    for path in base_dir.iterdir():
        if path.is_dir():
            continue  # already-namespaced user directories or unrelated
        if path.name == MARKER_FILENAME:
            continue
        if path.suffix.lower() not in {".json"}:
            continue
        dest = target / path.name
        if dest.exists():
            # Don't clobber existing per-user data. Leave the orphan in place.
            continue
        shutil.move(str(path), str(dest))
        moved += 1
    marker.write_text("ok\n", encoding="utf-8")
    return moved


def run_namespace_migration(
    *,
    notebook_dir: str | Path,
    knowledge_dir: str | Path,
    user_id: str = DEFAULT_USER_ID,
) -> dict[str, int]:
    """Run the migration for both storage roots. Returns counts moved."""
    return {
        "notebooks_moved": _migrate_dir(Path(notebook_dir), user_id),
        "knowledge_moved": _migrate_dir(Path(knowledge_dir), user_id),
    }
