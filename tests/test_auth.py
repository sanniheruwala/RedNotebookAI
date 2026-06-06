"""Tests for the path-2 auth foundation."""

import pytest

pytest.importorskip("pydantic")
pytest.importorskip("bcrypt")
pytest.importorskip("jwt")

from rednotebook.auth.models import (  # noqa: E402
    AuthProvider,
    InviteToken,
    User,
    UserRole,
    make_default_user,
)
from rednotebook.auth.passwords import (  # noqa: E402
    WeakPasswordError,
    hash_password,
    validate_password_strength,
    verify_password,
)
from rednotebook.auth.sessions import (  # noqa: E402
    InvalidSessionError,
    create_session_token,
    decode_session_token,
)
from rednotebook.auth.store import UserStore  # noqa: E402


def test_password_hash_roundtrip():
    h = hash_password("hunter2-pass")
    assert verify_password("hunter2-pass", h)
    assert not verify_password("wrong", h)
    assert not verify_password("hunter2-pass", "")


def test_password_strength_rejects_short_and_common():
    with pytest.raises(WeakPasswordError):
        validate_password_strength("short")
    with pytest.raises(WeakPasswordError):
        validate_password_strength("password")
    validate_password_strength("a-decent-passphrase")


def test_session_token_roundtrip():
    long_key = "a" * 64
    t = create_session_token(user_id="user-1", secret_key=long_key)
    payload = decode_session_token(t, long_key)
    assert payload["sub"] == "user-1"


def test_session_token_rejects_wrong_secret():
    long_key = "a" * 64
    t = create_session_token(user_id="user-1", secret_key=long_key)
    with pytest.raises(InvalidSessionError):
        decode_session_token(t, "b" * 64)


def test_default_user_is_synthetic_admin():
    u = make_default_user()
    assert u.id == "default"
    assert u.role is UserRole.ADMIN
    assert u.is_admin
    assert u.provider is AuthProvider.LOCAL


def test_user_store_add_lookup(tmp_path):
    store = UserStore(tmp_path)
    assert store.is_first_signup()
    u = User(email="a@b.com", name="Alice", password_hash=hash_password("verysecret"))
    store.add_user(u)
    assert not store.is_first_signup()
    found = store.get_user_by_email("a@b.com")
    assert found is not None
    assert found.id == u.id


def test_user_store_rejects_duplicate_email(tmp_path):
    store = UserStore(tmp_path)
    store.add_user(User(email="dup@b.com", name="A"))
    with pytest.raises(ValueError):
        store.add_user(User(email="DUP@b.com", name="B"))


def test_invite_token_consumption(tmp_path):
    store = UserStore(tmp_path)
    admin = store.add_user(
        User(email="admin@b.com", name="Admin", role=UserRole.ADMIN)
    )
    invite = store.add_invite(InviteToken(issued_by=admin.id))
    assert invite.is_valid
    consumed = store.consume_invite(invite.token, "new-user-id")
    assert consumed.is_consumed
    with pytest.raises(ValueError):
        store.consume_invite(invite.token, "another")


def test_namespace_migration_moves_orphans(tmp_path):
    from rednotebook.migrations.auto_namespace import run_namespace_migration

    nb_dir = tmp_path / "notebooks"
    kn_dir = tmp_path / "knowledge"
    nb_dir.mkdir()
    kn_dir.mkdir()
    (nb_dir / "x.json").write_text("{}", encoding="utf-8")
    (kn_dir / "y.json").write_text("{}", encoding="utf-8")
    counts = run_namespace_migration(
        notebook_dir=nb_dir, knowledge_dir=kn_dir
    )
    assert counts == {"notebooks_moved": 1, "knowledge_moved": 1}
    assert (nb_dir / "default" / "x.json").exists()
    assert (kn_dir / "default" / "y.json").exists()
    # Idempotent: second run is a no-op.
    counts2 = run_namespace_migration(
        notebook_dir=nb_dir, knowledge_dir=kn_dir
    )
    assert counts2 == {"notebooks_moved": 0, "knowledge_moved": 0}
