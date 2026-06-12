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
- ✅ Server-side query cancellation via a process-wide query-id
       registry. DuckDB uses `interrupt()`, Trino uses `cursor.cancel()`,
       Postgres / Redshift use `pg_cancel_backend(pid)`, MySQL / MariaDB
       use `KILL QUERY pid`. The Stop button now actually reaches the
       engine instead of just aborting the HTTP request (v0.7.15).
- ✅ Richer profiling: per-column histograms (sparkline-rendered in the
       Profile tab) and a "Related columns" panel ranked by normalised
       mutual information (v0.7.15).
- ✅ Headless-browser PDF / PNG export for infographics via Playwright
       — install the `[exports]` extra and run `playwright install
       chromium`, then use the PDF / PNG buttons in the infographic
       modal (v0.7.15).
- ✅ Cursor AI provider — OpenAI-compatible endpoint with a
       configurable `CURSOR_BASE_URL` so any compatible gateway works
       (v0.7.15).
- ✅ Explain SQL button replaced by a prominent "Summarize result"
       button that pulls a deep numeric briefing (headline, numbers
       worth knowing, key findings, distribution shape, anomalies,
       follow-up questions) from the actual result (v0.7.15).
- ✅ Connection control unified in the left sidebar; removed from the
       topbar to cut UI duplication (v0.7.15).
- ✅ NotebookLM-style knowledge layer: `[n]` citation markers in chat
       answers (chips scroll to the cited source card), plus a Studio
       dialog that generates Overview / FAQ / Study guide / Suggested
       follow-up questions from the notebook's sources (v0.7.15).
- 🟡 Python cell type — deferred. RedNotebook AI stays SQL-first.

## Phase 3. More connectors — ✅ shipped in v0.7.x

- ✅ DuckDB (v0.3)
- ✅ PostgreSQL, MySQL, MariaDB, SQLite, MSSQL, Snowflake, BigQuery,
       Redshift, Oracle, ClickHouse, Databricks (v0.7.0, 11 SQL connectors
       via a generic SQLAlchemy backend)
- ✅ Drivers bundled by default — no `pip install ...[extras]` step
       needed (v0.7.5)
- ✅ Drag-and-drop file uploads — CSV, TSV, Parquet, JSON, JSONL,
       NDJSON. Files are registered as DuckDB views automatically so
       users query them by table name immediately after dropping
       (v0.7.16).
- 🟡 Athena (not yet)
- 🟡 Excel (.xlsx) — needs the DuckDB `excel` extension to be
       autoloaded.
- 🟡 Google Sheets upload (not yet — requires OAuth).

## Phase 4. Collaboration / SaaS — 🟡 in progress

- ✅ Rate limiting via `slowapi` on auth + AI routes (already shipped).
- ✅ Audit log (`rednotebook/audit/log.py`) — surfaced in the admin UI.
- ✅ Git-backed notebooks — per-user notebook directory is a real git
       repo with autosave-driven commits + a History dialog that
       restores any version (v0.7.15).
- ✅ One-click static HTML share links — `POST /api/notebooks/{id}/
       publish` mints a token; the page is served unauthenticated at
       `/published/{token}`. Notebook + result snapshots travel as a
       single self-contained HTML doc (v0.7.16).
- 🟡 Sharing + threaded comments on the *live* notebook (the static
       publish covers read-only sharing today).
- 🟡 Scheduled queries / alerts
- 🟡 Dashboard publishing (notebook → parameterised app with input
       widgets — the publish HTML is the foundation).
- 🟡 dbt + Airflow integrations
- 🟡 Semantic layer
- 🟡 Cross-source joins via DuckDB ATTACH — design notes in
       [docs/design/cross-source-joins.md](design/cross-source-joins.md).
- 🟡 Reactive notebooks (Marimo-style auto-rerun of downstream cells) —
       design notes in [docs/design/reactive-notebooks.md](design/reactive-notebooks.md).
- 🟡 Full RBAC / SSO (partial — GitHub OAuth + admin invites shipped).
- 🟡 Hosted SaaS version
