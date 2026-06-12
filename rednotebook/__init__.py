"""RedNotebook AI. Open-source AI data notebook."""

# Single source of truth: pyproject.toml. importlib.metadata reads the
# installed package's metadata at runtime so a bump in pyproject.toml +
# `pip install -e .` (or a fresh wheel install) keeps __version__ in
# sync — no more drift between the wheel name and the value the UI
# shows in the topbar / health endpoint.
from importlib.metadata import PackageNotFoundError
from importlib.metadata import version as _pkg_version

try:
    __version__ = _pkg_version("rednotebook-ai")
except PackageNotFoundError:  # pragma: no cover - dev tree without an install
    __version__ = "0.0.0"

__app_name__ = "RedNotebook AI"
