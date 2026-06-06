"""Helpers for minting and verifying API personal access tokens (PATs)."""

from __future__ import annotations

import secrets

from rednotebook.auth.passwords import hash_password, verify_password

TOKEN_PREFIX = "rnt_"
TOKEN_BODY_BYTES = 32  # 256-bit random token body
PUBLIC_PREFIX_LEN = 12  # how much of the token to keep visible (incl. "rnt_")


def mint_token() -> str:
    """Generate a new plaintext API token.

    Format: ``rnt_<43-char-urlsafe-base64>`` (256 bits of entropy).
    """
    return TOKEN_PREFIX + secrets.token_urlsafe(TOKEN_BODY_BYTES)


def token_prefix(plaintext: str) -> str:
    """Return the public, identification-only prefix of a token."""
    return plaintext[:PUBLIC_PREFIX_LEN]


def hash_token(plaintext: str) -> str:
    return hash_password(plaintext)


def verify_token(plaintext: str, stored_hash: str) -> bool:
    return verify_password(plaintext, stored_hash)


def looks_like_api_token(value: str) -> bool:
    """Cheap shape check before doing a database lookup."""
    return bool(value) and value.startswith(TOKEN_PREFIX) and len(value) > 16
