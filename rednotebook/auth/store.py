"""File-backed user + invite-token store.

JSON on disk, one file per kind. Designed for the local-first / single-team
deployments described in docs/deployment.md. Heavier traffic should swap this
for SQLite/Postgres but the interface stays.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Any

from rednotebook.auth.models import InviteToken, User, UserRole


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    raise TypeError(f"Not JSON serializable: {type(value).__name__}")


class UserStore:
    """A simple JSON-backed user + invite-token store."""

    def __init__(self, base_dir: str | Path) -> None:
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._users_path = self.base_dir / "users.json"
        self._invites_path = self.base_dir / "invites.json"
        self._lock = RLock()

    # ----- Disk helpers ------------------------------------------------------
    def _read_users(self) -> list[dict[str, Any]]:
        if not self._users_path.exists():
            return []
        return json.loads(self._users_path.read_text(encoding="utf-8"))

    def _write_users(self, items: list[dict[str, Any]]) -> None:
        self._users_path.write_text(
            json.dumps(items, indent=2, default=_json_default),
            encoding="utf-8",
        )

    def _read_invites(self) -> list[dict[str, Any]]:
        if not self._invites_path.exists():
            return []
        return json.loads(self._invites_path.read_text(encoding="utf-8"))

    def _write_invites(self, items: list[dict[str, Any]]) -> None:
        self._invites_path.write_text(
            json.dumps(items, indent=2, default=_json_default),
            encoding="utf-8",
        )

    # ----- Users -------------------------------------------------------------
    def list_users(self) -> list[User]:
        return [User.model_validate(u) for u in self._read_users()]

    def count_users(self) -> int:
        return len(self._read_users())

    def get_user(self, user_id: str) -> User | None:
        for u in self.list_users():
            if u.id == user_id:
                return u
        return None

    def get_user_by_email(self, email: str) -> User | None:
        target = email.lower().strip()
        for u in self.list_users():
            if u.email.lower().strip() == target:
                return u
        return None

    def get_user_by_provider_subject(
        self, provider: str, subject: str
    ) -> User | None:
        for u in self.list_users():
            if u.provider == provider and u.provider_subject == subject:
                return u
        return None

    def add_user(self, user: User) -> User:
        with self._lock:
            users = self._read_users()
            if any(
                (u.get("email", "").lower() == user.email.lower()) for u in users
            ):
                raise ValueError(f"User already exists: {user.email}")
            users.append(user.model_dump(mode="json"))
            self._write_users(users)
        return user

    def update_user(self, user: User) -> User:
        with self._lock:
            users = self._read_users()
            for i, u in enumerate(users):
                if u.get("id") == user.id:
                    users[i] = user.model_dump(mode="json")
                    self._write_users(users)
                    return user
            raise KeyError(f"User not found: {user.id}")

    def is_first_signup(self) -> bool:
        """True when no real user has been created yet (admin bootstrap)."""
        return self.count_users() == 0

    # ----- Invite tokens -----------------------------------------------------
    def list_invites(self) -> list[InviteToken]:
        return [InviteToken.model_validate(i) for i in self._read_invites()]

    def get_invite(self, token: str) -> InviteToken | None:
        for i in self.list_invites():
            if i.token == token:
                return i
        return None

    def add_invite(self, invite: InviteToken) -> InviteToken:
        with self._lock:
            invites = self._read_invites()
            invites.append(invite.model_dump(mode="json"))
            self._write_invites(invites)
        return invite

    def consume_invite(self, token: str, user_id: str) -> InviteToken:
        with self._lock:
            invites = self._read_invites()
            from datetime import UTC
            from datetime import datetime as _dt

            now = _dt.now(UTC)
            for i, raw in enumerate(invites):
                inv = InviteToken.model_validate(raw)
                if inv.token == token and inv.is_valid:
                    updated = inv.model_copy(
                        update={"accepted_at": now, "accepted_by": user_id}
                    )
                    invites[i] = updated.model_dump(mode="json")
                    self._write_invites(invites)
                    return updated
            raise ValueError("Invite token is invalid, expired, or already used")

    def admin_emails(self) -> list[str]:
        return [u.email for u in self.list_users() if u.role is UserRole.ADMIN]
