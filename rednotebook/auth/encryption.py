"""Symmetric encryption helpers for server-side secrets.

We derive a deterministic Fernet key from the application's ``SECRET_KEY``
so existing deployments don't need a separate key file. If ``SECRET_KEY``
changes, existing ciphertexts will become unreadable, which is the same
property as JWT sessions invalidating on key rotation.
"""

from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken


class DecryptionError(RuntimeError):
    """Raised when a ciphertext cannot be decrypted with the current key."""


def _derive_fernet_key(secret_key: str) -> bytes:
    """SHA-256 of the configured secret -> 32-byte key -> urlsafe base64."""
    digest = hashlib.sha256(secret_key.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


def get_cipher(secret_key: str) -> Fernet:
    return Fernet(_derive_fernet_key(secret_key))


def encrypt(secret_key: str, plaintext: str) -> str:
    return get_cipher(secret_key).encrypt(plaintext.encode("utf-8")).decode("utf-8")


def decrypt(secret_key: str, ciphertext: str) -> str:
    try:
        return get_cipher(secret_key).decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise DecryptionError("Could not decrypt with current key") from exc
