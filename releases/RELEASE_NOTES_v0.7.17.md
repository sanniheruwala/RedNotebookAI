# v0.7.17

Small but high-touch quality-of-life release.

## Highlights

### 🧹 Dialect-aware SQL formatter button

A new one-click formatter in every SQL cell's top-right toolbar (between
the duplicate and trash icons). Hit it → the cell SQL is pretty-printed
in place using the dialect that matches the active connection.

- Runs **client-side** via [`sql-formatter`](https://github.com/sql-formatter-org/sql-formatter)
  (~30 KB) — no server round trip, instant feel.
- Auto-detects dialect from the connection's `connector_type` for all
  13 shipped engines (DuckDB, Trino, Postgres, MySQL, MariaDB, SQLite,
  MSSQL → transactsql, Snowflake, BigQuery, Redshift, Oracle → plsql,
  ClickHouse, Databricks → spark). Falls back to generic `sql`.
- Settings: `keywordCase: "upper"`, `tabWidth: 2` — matches the
  in-app code style.
- Edge cases: button disabled on empty cells; malformed SQL toasts the
  error and leaves the original untouched; already-formatted SQL is
  a no-op.

## Upgrade notes

- New frontend dep: `sql-formatter@^15.8.1`. Existing Docker pulls get
  it on the next image rebuild.
- No backend changes; the dep ships only with the frontend bundle.

## Full changelog

See the auto-generated commit log at the bottom of this release.
