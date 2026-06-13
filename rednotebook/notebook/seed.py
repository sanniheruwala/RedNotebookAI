"""Lazy-seed bundled sample notebooks into a fresh per-user storage dir.

Why this exists: the first time a brand-new user (or the public demo
container) opens the app, they land on a blank slate with no notebooks to
explore. Empty-state messaging only goes so far — concrete examples are
much faster to grok. So we ship a small ``rednotebook/samples/`` directory
of starter notebooks and copy them into the user's storage on first use.

Triggered from the ``GET /api/notebooks`` route handler: if the user's
notebook directory is empty (no ``*.json``), copy every file from
``samples/`` in. Each file is rewritten with a fresh notebook id so two
users seeded from the same source don't collide on shared persistence.
After the copy, future requests find the existing notebooks and skip the
seed (idempotent).
"""

from __future__ import annotations

import json
import logging
import uuid
from importlib import resources
from pathlib import Path

_log = logging.getLogger(__name__)

# Sample manifest file dropped alongside the JSON files in
# ``rednotebook/samples/``; its presence is what the "have we seeded this
# user already?" check looks at. If you ever want to re-seed an existing
# user (e.g. after pushing new samples), delete this file from their dir.
_SEED_MARKER_NAME = ".seeded"

#: Bundled samples — every ``*.json`` shipped under
#: ``rednotebook/samples/``. Add new files to that directory to seed more.
_SAMPLES_PACKAGE = "rednotebook.samples"


def _iter_sample_payloads() -> list[dict]:
    """Load every bundled sample notebook from the packaged samples dir.

    Uses ``importlib.resources`` so this works the same way in:
      * a dev tree (``pip install -e .``)
      * a packaged wheel
      * the Docker image

    Files that fail to parse are logged + skipped — one bad sample
    shouldn't take down the seed step.
    """
    out: list[dict] = []
    try:
        package_files = resources.files(_SAMPLES_PACKAGE)
    except (ModuleNotFoundError, FileNotFoundError):
        return out
    for entry in package_files.iterdir():
        name = getattr(entry, "name", "")
        if not name.endswith(".json"):
            continue
        try:
            payload = json.loads(entry.read_text(encoding="utf-8"))
            out.append(payload)
        except Exception as exc:
            _log.warning("Skipping malformed sample %s: %s", name, exc)
    return out


def seed_if_empty(notebook_dir: str | Path) -> int:
    """Seed bundled samples when ``notebook_dir`` is fresh.

    Returns the number of notebooks written. Idempotent: future calls
    find the seed marker (or any pre-existing notebook JSON) and skip.
    """
    target = Path(notebook_dir)
    target.mkdir(parents=True, exist_ok=True)

    # Two skip conditions: explicit marker (clean signal we've seeded this
    # user before), OR any *.json already on disk (user has real work, we
    # don't want to inject samples on top of it).
    if (target / _SEED_MARKER_NAME).exists():
        return 0
    if any(target.glob("*.json")):
        # Pre-existing notebooks — drop the marker so we don't keep
        # checking + don't accidentally seed if those notebooks are
        # deleted later.
        try:
            (target / _SEED_MARKER_NAME).touch()
        except Exception:
            pass
        return 0

    samples = _iter_sample_payloads()
    if not samples:
        return 0

    written = 0
    for payload in samples:
        # Mint a fresh id so two users seeded from the same source don't
        # collide on shared persistence (matters in the public demo + in
        # multi-user mode).
        new_id = uuid.uuid4().hex
        payload = {**payload, "id": new_id}
        # Make sure cell ids are also unique — the originals were minted
        # in the dev env; collisions across users would be confusing on a
        # shared instance.
        if isinstance(payload.get("cells"), list):
            payload["cells"] = [
                {**c, "id": uuid.uuid4().hex} if isinstance(c, dict) else c
                for c in payload["cells"]
            ]
        try:
            (target / f"{new_id}.json").write_text(
                json.dumps(payload, indent=2), encoding="utf-8"
            )
            written += 1
        except Exception as exc:
            _log.warning("Failed to write sample %s: %s", new_id, exc)

    try:
        (target / _SEED_MARKER_NAME).touch()
    except Exception:
        pass

    if written:
        _log.info(
            "Seeded %d bundled sample notebook(s) into %s", written, target
        )
    return written
