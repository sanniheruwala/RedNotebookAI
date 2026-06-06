# Roadmap

## Phase 1. MVP (this release)

- Trino HTTPS connector
- Notebook UI (SQL, Markdown, AI prompt cells)
- Result table + profile + chart + AI summary tabs
- SQL guard with read-only default
- Mock AI provider (offline) + OpenAI/Anthropic/Ollama options
- Internal Knowledge Notebook + infographic HTML export
- Notebook persistence (local JSON)
- FastAPI HTTP layer + Typer CLI + Docker

## Phase 2. Polish & analyst tooling

- AI chat over knowledge sources
- Better infographic templates + PDF/PNG export (kaleido + headless Chrome)
- AG Grid Community for power-user result navigation
- Saved connections + secret manager integration
- Python cell type (where notebook host allows)
- Better profiling (histograms, mutual-info hints)

## Phase 3. More connectors

- PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, Athena
- Databricks SQL, DuckDB, ClickHouse
- CSV / Excel / Google Sheets upload

## Phase 4. Collaboration / SaaS

- Git-backed notebooks
- Sharing + comments
- Scheduled queries / alerts
- Dashboard publishing
- dbt + Airflow integrations
- Semantic layer
- RBAC / SSO
- Hosted SaaS version
