"""SQL guard tests — no external deps required."""

from rednotebook.security.sql_guard import SQLGuardVerdict, check_sql


def test_select_allowed():
    r = check_sql("SELECT 1")
    assert r.verdict is SQLGuardVerdict.ALLOWED


def test_with_cte_allowed():
    r = check_sql("WITH t AS (SELECT 1) SELECT * FROM t")
    assert r.verdict is SQLGuardVerdict.ALLOWED


def test_show_allowed():
    assert check_sql("SHOW CATALOGS").verdict is SQLGuardVerdict.ALLOWED


def test_drop_blocked():
    r = check_sql("DROP TABLE users")
    assert r.verdict is SQLGuardVerdict.BLOCKED
    assert "DROP" in r.dangerous_keywords


def test_delete_blocked():
    assert check_sql("DELETE FROM users WHERE 1=1").verdict is SQLGuardVerdict.BLOCKED


def test_multi_statement_with_dangerous_is_blocked():
    r = check_sql("SELECT * FROM users; DROP TABLE users")
    assert r.verdict is SQLGuardVerdict.BLOCKED


def test_empty_sql_is_blocked():
    assert check_sql("").verdict is SQLGuardVerdict.BLOCKED


def test_comment_does_not_smuggle_dangerous():
    # DROP inside a comment must NOT trigger blocking.
    assert check_sql("SELECT 1 -- DROP TABLE x").verdict is SQLGuardVerdict.ALLOWED
    assert check_sql("/* DROP TABLE x */ SELECT 1").verdict is SQLGuardVerdict.ALLOWED


def test_writes_allowed_yield_warn():
    r = check_sql("INSERT INTO t VALUES (1)", allow_write_queries=True)
    assert r.verdict is SQLGuardVerdict.WARN
