"""Desktop launcher used by the PyInstaller bundle.

Boots uvicorn on a free local port, mounts the bundled Next.js export, and
opens the user's default browser at the app URL. Logs go to a rolling file
under the user's data directory so a double-click launch doesn't lose
diagnostics when the terminal is closed.
"""

from __future__ import annotations

import os
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path


def _user_data_dir() -> Path:
    """Return a platform-appropriate per-user data directory."""
    if sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support" / "RedNotebook AI"
    elif sys.platform.startswith("win"):
        base = Path(os.environ.get("APPDATA", Path.home())) / "RedNotebook AI"
    else:
        base = (
            Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share"))
            / "rednotebook-ai"
        )
    base.mkdir(parents=True, exist_ok=True)
    return base


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _wait_for_server(host: str, port: int, timeout: float = 20.0) -> bool:
    """Block until the FastAPI server starts accepting connections."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.2)
    return False


def main() -> None:
    import uvicorn

    data_dir = _user_data_dir()
    # Point storage at the user's per-account data directory so notebooks
    # survive across upgrades and don't pollute /Applications or Program Files.
    os.environ.setdefault("NOTEBOOK_STORAGE_DIR", str(data_dir / "notebooks"))
    os.environ.setdefault("KNOWLEDGE_STORAGE_DIR", str(data_dir / "knowledge"))
    os.environ.setdefault("AUTH_STORAGE_DIR", str(data_dir / "auth"))
    os.environ.setdefault("ARTIFACTS_DIR", str(data_dir / "artifacts"))
    os.environ.setdefault("EXPORTS_DIR", str(data_dir / "exports"))

    port = int(os.environ.get("REDNOTEBOOK_PORT", "0")) or _free_port()
    host = "127.0.0.1"
    url = f"http://{host}:{port}/"

    # Log lifecycle to a rolling file so users can debug headless launches.
    log_path = data_dir / "rednotebook-desktop.log"
    log_file = open(log_path, "a", encoding="utf-8", buffering=1)
    sys.stdout = log_file  # type: ignore[assignment]
    sys.stderr = log_file  # type: ignore[assignment]
    print(f"---- RedNotebook AI desktop start, {time.strftime('%Y-%m-%dT%H:%M:%S')} ----")
    print(f"data_dir={data_dir}")
    print(f"url={url}")

    # Start the server in a background thread so we can open the browser
    # once it's actually reachable.
    def _serve() -> None:
        # Importing here lets PyInstaller's analysis pick up the dependency
        # without needing extra hidden-imports incantations.
        from rednotebook.server.main import app

        uvicorn.run(
            app,
            host=host,
            port=port,
            log_level="info",
            access_log=False,
        )

    thread = threading.Thread(target=_serve, name="uvicorn", daemon=True)
    thread.start()

    if _wait_for_server(host, port):
        webbrowser.open_new(url)
    else:
        print("Server did not start within timeout", file=sys.stderr)
        sys.exit(1)

    # Keep the foreground process alive. CTRL-C in a launched terminal exits.
    try:
        while thread.is_alive():
            thread.join(timeout=1.0)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
