# RedNotebook AI

> Open-source AI data notebook for Trino and modern data platforms, query, visualize, profile, and explore data with beautiful charts, AI suggestions, and NotebookLM-style knowledge reports.

RedNotebook AI is a premium, notebook-first analytics application that lets you
connect to Trino over HTTPS, browse metadata, write SQL, run queries, visualize
data, profile datasets, get AI-assisted SQL and insights, and turn query
outputs into a NotebookLM-style knowledge layer with infographic reports.

It is designed to feel like a modern blend of **Hex**, **Deepnote**,
**Databricks Notebook**, **Jupyter**, **Observable**, and **NotebookLM**, but
stays lightweight, open-source, and developer-friendly.

<picture>
  <source media="(prefers-color-scheme: light)" srcset="docs/images/screenshot-light.png">
  <img alt="RedNotebook AI: notebook canvas with SQL cell, metadata sidebar, and AI assistant panel" src="docs/images/screenshot-dark.png">
</picture>

<details>
<summary><sub>Light theme preview</sub></summary>

![Light theme](docs/images/screenshot-light.png)

</details>

---

## Where can I run this?

RedNotebook AI is **local-first**. Today:

| Tier | Supported? |
|------|------------|
| 🟢 **Your laptop** (`localhost`) | ✅ Primary use case |
| 🟡 **Single team behind VPN / private network** | ✅ With the [deployment hardening checklist](docs/deployment.md#tier-2--single-team-behind-a-vpn--private-network) |
| 🔴 **Public internet, multi-user SaaS** | ❌ Not yet, no auth, no per-user namespacing, no rate limiting. See [Phase 4 roadmap](docs/roadmap.md). |

See [`docs/deployment.md`](docs/deployment.md) for the full security model
and the Tier 2 hardening checklist before sharing an instance with a team.

---

## Features (Phase 1 MVP)

- **Trino HTTPS connector** with test, browse, and run support
- **Notebook-first UI** built with Next.js, Tailwind, shadcn/ui, and Monaco editor
- **AI assistant** (mock by default; optional OpenAI, Anthropic, Ollama)
  - natural-language → SQL
  - SQL explanation + optimization
  - result summary
  - chart suggestion
  - infographic brief
- **Ultra-HD visualizations** via Apache ECharts + Plotly (export to HTML)
- **Data profiling** with PII / restricted column detection
- **Knowledge Notebook** (internal mode) for sources, infographics, and reports
- **SQL safety guard**, read-only by default, write queries blocked unless
  `ALLOW_WRITE_QUERIES=true`
- **Notebook persistence** as local JSON files
- **FastAPI HTTP layer** + Typer CLI + Docker setup

> ⚠️ **Read-only by default.** Write queries are blocked unless explicitly enabled.

---

## Architecture

| Layer | Tech |
|-------|------|
| Backend | Python 3.11+, FastAPI, Pydantic, Trino client, Pandas, Plotly |
| AI providers | Mock (default), OpenAI, Anthropic, Ollama, pluggable |
| Frontend | Next.js 14, TypeScript, Tailwind, shadcn/ui |
| State | TanStack Query (server) + Zustand (local) |
| Tables | TanStack Table |
| Charts | Apache ECharts (via `echarts-for-react`) + Plotly fallback |
| Editor | Monaco Editor |
| Storage | Local JSON for notebooks/knowledge, optional Parquet cache |

```
RedNotebookAI/
├── rednotebook/         # Python backend (FastAPI + core libs)
│   ├── server/          # FastAPI app + routers
│   ├── connectors/      # Trino + base plug-in interface
│   ├── ai/              # Provider abstraction + mock/openai/anthropic/ollama
│   ├── notebook/        # Notebook models, storage, runner
│   ├── knowledge/       # NotebookLM-style internal knowledge layer
│   ├── visualization/   # Recommender, chart spec, infographic
│   ├── profiling/       # Stats + PII detector
│   ├── security/        # SQL guard, secret masking
│   ├── cache/           # Optional Parquet cache
│   └── cli/             # Typer CLI
├── frontend/            # Next.js + Tailwind + shadcn/ui
├── tests/               # pytest tests
└── docs/                # docs/architecture/ai/security/...
```

---

## Quick start

### 1. Python backend

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"        # or pip install .
cp .env.example .env           # then edit
rednotebook validate-config
rednotebook run                # starts FastAPI on :8000
```

### 2. Next.js frontend

```bash
cd frontend
npm install
npm run dev                    # starts Next.js on :3000
```

Open http://localhost:3000.

### 3. Docker

```bash
docker compose up --build
```

This builds the Python backend image and exposes it on `:8000`. Run the
frontend locally (or build a separate image as needed).

---

## Configuring Trino

Configure the connection inside the UI (top-bar → "Configure Trino") or set
defaults in `.env`:

```env
TRINO_HOST=trino.example.com
TRINO_PORT=443
TRINO_SCHEME=https
TRINO_USER=alice
TRINO_PASSWORD=...
TRINO_CATALOG=hive
TRINO_SCHEMA=default
TRINO_VERIFY_SSL=true
```

The UI panel supports custom HTTP headers, session properties, query timeout,
and result limits.

---

## AI setup

```env
# default: offline mock provider
AI_PROVIDER=mock

# OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
# Anthropic
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# Ollama (local)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
```

**Privacy defaults:**

- Sample rows are not sent to AI unless `AI_ALLOW_SAMPLE_ROWS=true`
- PII columns are masked when sample rows are allowed
- Secrets are stripped from SQL before AI processing
- Credentials are **never** sent to AI

---

## Knowledge Notebook

The Knowledge Notebook is RedNotebook AI's NotebookLM-style layer. It stores:

- SQL queries, schemas, profiles, charts, summaries
- Generated infographics (HTML)
- Markdown notes and business definitions

It works **fully locally**. The optional `NotebookLM Enterprise` provider is
shipped as an experimental stub, it is disabled unless explicit Google Cloud
config is provided. No browser scraping, no unofficial endpoints.

See [docs/notebooklm_integration.md](docs/notebooklm_integration.md).

---

## Security model

- **Read-only by default**, destructive SQL is blocked
- **SQL guard** uses sqlglot when available, plus a robust keyword scanner
- **Secret masking** for AI prompts and knowledge sources
- **PII detection** flags emails, phone numbers, card numbers, tokens, etc.

See [docs/security.md](docs/security.md).

---

## Connector roadmap

| Status | Connector |
|--------|-----------|
| ✅ | Trino HTTPS |
| Planned | PostgreSQL, MySQL, BigQuery, Snowflake, Redshift, Athena |
| Planned | Databricks SQL, DuckDB, ClickHouse |
| Planned | CSV / Excel / Google Sheets upload |

All connectors implement a single `BaseConnector` interface. See
[docs/connectors.md](docs/connectors.md).

---

## Tests & lint

```bash
pytest
ruff check .
```

The frontend has separate scripts:

```bash
cd frontend
npm run lint
npm run typecheck
```

---

## Contributing

PRs welcome. Please read [docs/contributing.md](docs/contributing.md) for the
preferred workflow and code style.

---

## License

Apache-2.0, see [LICENSE](LICENSE).
