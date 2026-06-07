# Roadmap

## Phase 1. MVP — ✅ shipped

- Trino HTTPS connector
- Notebook UI (SQL, Markdown, AI prompt cells)
- Result table + profile + chart + AI summary tabs
- SQL guard with read-only default
- Mock AI provider (offline) + OpenAI / Anthropic / Ollama options
- Internal Knowledge Notebook + infographic HTML export
- Notebook persistence (local JSON)
- FastAPI HTTP layer + Typer CLI + Docker

## Phase 2. Polish & analyst tooling — ✅ mostly shipped

- ✅ AI chat over knowledge sources (multi-turn Ask AI)
- ✅ Saved connections store + per-instance credentials
- ✅ Per-user namespacing (auth, GitHub OAuth, API tokens, admin invites)
- ✅ AG Grid for power-user result navigation
- ✅ Knowledge layer as a first-class slide-in panel with full CRUD
- ✅ Stop button + live elapsed-time timer on the SQL cell (v0.7.6) —
       client-side abort; proper server-side cancel via query-id tracking
       is still to do.
- ✅ Metadata panel sized correctly so the tree is visible alongside the
       notebooks list, plus auto-expand for single-catalog/single-schema
       connectors (v0.7.6).
- ✅ AI SDKs (`anthropic`, `openai`) bundled by default — picking an AI
       provider in the admin settings now instantiates the real provider
       instead of silently falling back to the mock (v0.7.7).
- ✅ Visible "AI is thinking…" states wired into every AI/Knowledge
       entry point (Explain / Optimize / Ask AI / Knowledge chat /
       Summarize result / Generate infographic) and a warning log when
       a configured provider falls back to mock so the failure surfaces
       in server logs (v0.7.7).
- ✅ "Do what I mean" provider switching: saving an OpenAI / Anthropic
       key auto-sets the active provider when none was picked. Active
       vs configured provider surfaced in the admin AI page banner and
       the settings dialog so the silent-fallback case is visible.
       Model name is a curated dropdown (top recent models) with
       free-text fallback. Ask AI cell no longer duplicates the user
       message after the assistant reply lands (v0.7.8).
- ✅ AI providers raise real errors instead of pretending the request
       succeeded with mock output. Chart Auto-suggest now actually
       calls the LLM (the route was hardcoded to the deterministic
       recommender). Admin AI page gained a "Test connection" button
       that probes the provider with a trivial prompt and surfaces
       the exact provider/model/error string. Every AI surface
       (Explain, Optimize, Ask AI, Knowledge chat, Summarize result,
       Generate infographic, Chart auto-suggest) now goes through the
       configured provider end-to-end (v0.7.9).
- 🟡 Server-side query cancellation via query-id tracking (DuckDB
       `interrupt()`, Trino `cancel()`, Postgres `pg_cancel_backend`).
- 🟡 Better profiling (histograms, mutual-info hints)
- 🟡 Better infographic templates + PDF/PNG export (kaleido + headless Chrome)
- 🟡 Python cell type (where notebook host allows)

## Phase 3. More connectors — ✅ shipped in v0.7.x

- ✅ DuckDB (v0.3)
- ✅ PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, Snowflake, BigQuery,
       Redshift, Oracle, ClickHouse, Databricks (v0.7.0, 11 SQL connectors
       via a generic SQLAlchemy backend)
- ✅ Drivers bundled by default — no `pip install ...[extras]` step
       needed (v0.7.5)
- 🟡 Athena (not yet)
- 🟡 CSV / Excel / Google Sheets upload (not yet)

## Phase 4. Collaboration / SaaS — 🟡 in progress

- Git-backed notebooks
- Sharing + comments
- Scheduled queries / alerts
- Dashboard publishing
- dbt + Airflow integrations
- Semantic layer
- RBAC / SSO (partial — GitHub OAuth + invites shipped)
- Hosted SaaS version
