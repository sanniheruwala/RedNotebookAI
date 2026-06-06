"""App-wide runtime configuration (admin-set, encrypted at rest).

This is where admins put things like the OpenAI/Anthropic/Ollama keys when
they don't want to manage `.env`. The store sits in front of the env-var
fallback: callers ask the store, and only fall back to the environment when
no admin override exists.

Storage format: a single JSON file containing a Fernet-encrypted JSON
payload. Decrypting requires the server's ``SECRET_KEY``, so rotating
``SECRET_KEY`` invalidates the store (same invariant as JWT sessions and
the encrypted ConnectionStore).
"""

from __future__ import annotations

import json
from pathlib import Path
from threading import RLock
from typing import Any

from rednotebook.auth.encryption import DecryptionError, decrypt, encrypt


class RuntimeConfigStore:
    """Encrypted key-value store for admin-managed runtime settings."""

    def __init__(self, base_dir: str | Path, secret_key: str) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._path = self.base_dir / "runtime_config.json.enc"
        self._lock = RLock()
        self._secret_key = secret_key

    def _read_all(self) -> dict[str, Any]:
        if not self._path.exists():
            return {}
        try:
            blob = self._path.read_text(encoding="utf-8").strip()
            if not blob:
                return {}
            decrypted = decrypt(self._secret_key, blob)
            return json.loads(decrypted)
        except (DecryptionError, json.JSONDecodeError):
            # A SECRET_KEY change or a corrupted file: treat as empty rather
            # than crash the admin UI. The admin will need to re-enter values.
            return {}

    def _write_all(self, data: dict[str, Any]) -> None:
        ciphertext = encrypt(self._secret_key, json.dumps(data))
        self._path.write_text(ciphertext, encoding="utf-8")

    # ----- Public API --------------------------------------------------------
    def get(self, key: str, default: Any = None) -> Any:
        return self._read_all().get(key, default)

    def get_all(self) -> dict[str, Any]:
        return dict(self._read_all())

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            data = self._read_all()
            data[key] = value
            self._write_all(data)

    def update(self, values: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_all()
            data.update(values)
            self._write_all(data)
            return data

    def delete(self, key: str) -> bool:
        with self._lock:
            data = self._read_all()
            if key not in data:
                return False
            del data[key]
            self._write_all(data)
            return True
