# Architecture

RedNotebook AI is split into a Python backend and a Next.js frontend.

## Modules

```
rednotebook/
├── config/         # Settings (Pydantic) loaded from .env
├── security/       # SQL guard, secret masking
├── connectors/     # BaseConnector interface + Trino implementation + registry
├── notebook/       # Notebook + cell models, JSON storage, runner (guard-aware)
├── ai/             # Provider abstraction + mock/openai/anthropic/ollama
├── profiling/      # Result profiler + PII / restricted detector
├── visualization/  # Recommender, chart spec builder, infographic renderer
├── knowledge/      # Internal knowledge store + NotebookLM Enterprise stub
├── cache/          # Optional Parquet cache for results
├── server/         # FastAPI app + routers
└── cli/            # Typer CLI
```

## Data flow (run-a-cell)

1. UI sends `POST /api/query/run` with the connection payload and SQL.
2. FastAPI builds a `TrinoConnector` from the payload.
3. `rednotebook.notebook.runner.run_sql` calls `check_sql` first.
4. If blocked → return verdict; no execution.
5. Otherwise the connector executes the SQL and returns a typed `QueryResult`.
6. UI renders the result table, profile, chart, and AI summary tabs.

## AI flow

1. UI calls `/api/ai/*`.
2. `rednotebook.ai.registry.get_provider()` returns the configured provider,
   falling back to the deterministic `MockAIProvider` if anything fails.
3. `build_ai_context` ensures privacy defaults (no sample rows / mask PII /
   strip secrets) before the provider sees the data.

## Knowledge flow

1. The UI lets users add SQL, results, schemas, charts, and notes as sources.
2. `InternalKnowledgeStore` writes everything to local JSON files.
3. Infographics are generated as standalone HTML and (optionally) attached to
   a knowledge notebook.

## Connectors

Every connector implements `BaseConnector`:

- `test_connection`, `list_catalogs`, `list_schemas`, `list_tables`, `list_columns`
- `preview_table`, `run_query`, `explain_query`, `cancel_query`

Plug-ins register themselves with `register_connector("name", cls)`.
