# CLAUDE.md

# RedNotebook AI — Open-Source AI Data Notebook

## Project Identity

You are building **RedNotebook AI**, an open-source AI-powered data notebook by RedAnalytica.

RedNotebook AI is a notebook-first analytics application that lets users connect to Trino over HTTPS, browse metadata, write SQL, run queries, visualize data in ultra-HD charts, profile datasets, generate AI-assisted SQL and insights, and convert query outputs into NotebookLM-style knowledge sources, reports, and infographics.

The product should feel like a modern blend of:

* Hex
* Deepnote
* Databricks Notebook
* Jupyter
* Observable
* Superset Explore
* NotebookLM-style source intelligence

But it should remain lightweight, open-source, developer-friendly, and easy to run locally.

## Product Positioning

Build this as:

> Open-source AI data notebook for Trino and modern data platforms — query, visualize, profile, and explore data with beautiful charts, AI suggestions, and NotebookLM-style knowledge reports.

## Core MVP Goal

The first MVP must allow a user to:

1. Start the app locally.
2. Configure a Trino HTTPS connection.
3. Test the connection.
4. Browse catalogs, schemas, tables, and columns.
5. Run SQL queries in notebook cells.
6. View result tables.
7. Create high-quality visualizations.
8. Generate AI SQL suggestions and explanations.
9. Send query results, schemas, charts, and summaries into a knowledge notebook.
10. Generate an infographic-style report.
11. Save/load notebook files locally.
12. Export results and charts.

Do not build a toy app. Build a serious MVP that can be pushed to GitHub and improved.

---

# Recommended Architecture

Prefer a Python-first stack.

Use one of these approaches:

## Preferred MVP Option

Use **Marimo** if it gives the best notebook-native experience and clean Python interactivity.

Fallback option: **Streamlit** with a custom notebook-like interface.

If a richer frontend is needed later, design the backend so a future **FastAPI + React** UI can be added without rewriting connector, AI, profiling, and visualization logic.

## Backend/Library Stack

Use:

* Python 3.11+
* Pydantic for config and data models
* Trino Python client for Trino connectivity
* Pandas and/or Polars for result handling
* PyArrow for export
* DuckDB for local cache if useful
* Plotly for high-quality interactive charts and export
* SQLGlot for SQL parsing and safety checks if useful
* Typer for CLI
* pytest for tests
* Ruff for linting
* mypy or pyright for type checking
* python-dotenv for local environment variables

## Design Principles

* Notebook-first
* Secure by default
* Read-only by default
* Provider-agnostic AI
* Connector plugin architecture
* Local-first storage
* Privacy-safe AI context sharing
* Beautiful visual output
* Simple enough to run locally
* Modular enough to become SaaS later

---

# Repository Structure

Create this structure:

```text
rednotebook-ai/
  README.md
  CLAUDE.md
  LICENSE
  pyproject.toml
  .env.example
  .gitignore
  Dockerfile
  docker-compose.yml

  docs/
    architecture.md
    connectors.md
    ai.md
    security.md
    notebooklm_integration.md
    visualization.md
    roadmap.md
    contributing.md

  examples/
    sample_notebook.json
    sample_query_result.csv
    trino_connection_example.md
    infographic_example.md

  rednotebook/
    __init__.py

    app/
      __init__.py
      main.py
      state.py
      pages.py
      components/
        __init__.py
        connection_panel.py
        metadata_explorer.py
        notebook_canvas.py
        ai_panel.py
        knowledge_panel.py
        chart_builder.py
        result_table.py

    connectors/
      __init__.py
      base.py
      registry.py
      trino.py

    ai/
      __init__.py
      base.py
      mock.py
      openai_provider.py
      anthropic_provider.py
      ollama_provider.py
      prompts.py
      context_builder.py

    notebook/
      __init__.py
      models.py
      runner.py
      storage.py
      cells.py

    knowledge/
      __init__.py
      models.py
      store.py
      internal_provider.py
      notebooklm_enterprise_provider.py
      source_builder.py
      citations.py

    visualization/
      __init__.py
      charts.py
      recommender.py
      export.py
      infographic.py
      templates.py

    profiling/
      __init__.py
      profiler.py
      pii_detector.py
      stats.py

    security/
      __init__.py
      sql_guard.py
      secrets.py
      masking.py

    cache/
      __init__.py
      local_cache.py

    config/
      __init__.py
      settings.py

    cli/
      __init__.py
      main.py

  tests/
    test_trino_connector.py
    test_connector_base.py
    test_sql_guard.py
    test_notebook_models.py
    test_profiler.py
    test_pii_detector.py
    test_ai_context_builder.py
    test_knowledge_models.py
```

---

# Phase 1 MVP Scope

Build Phase 1 first. Do not overbuild.

Phase 1 must include:

* Local app
* Trino HTTPS connection form
* Connection testing
* Metadata explorer
* SQL notebook cell
* Query execution
* Query result table
* Chart builder
* Basic profiling
* Mock AI provider
* Optional real AI provider through environment variables
* Knowledge Notebook internal mode
* Infographic generator MVP
* Save/load notebook
* Export CSV
* Export chart as HTML and PNG if feasible
* SQL safety guard
* Dockerfile
* README
* Tests for core modules

---

# Trino HTTPS Connector

Implement a Trino connector using a clean base connector interface.

## Connection Inputs

Support:

* connection_name
* host
* port
* scheme: https
* user
* password/token
* catalog
* schema
* http_headers optional
* session_properties optional
* verify_ssl boolean
* ca_certificate_path optional
* source optional
* timezone optional
* query_timeout_seconds optional
* max_preview_rows optional
* max_result_rows optional

## Required Methods

Create a `BaseConnector` interface:

```python
class BaseConnector:
    def test_connection(self) -> bool: ...
    def list_catalogs(self) -> list[str]: ...
    def list_schemas(self, catalog: str) -> list[str]: ...
    def list_tables(self, catalog: str, schema: str) -> list[TableInfo]: ...
    def list_columns(self, catalog: str, schema: str, table: str) -> list[ColumnInfo]: ...
    def preview_table(self, catalog: str, schema: str, table: str, limit: int = 100): ...
    def run_query(self, sql: str, limit: int | None = None): ...
    def explain_query(self, sql: str): ...
    def cancel_query(self, query_id: str): ...
```

If Trino query cancellation is not practical in the first implementation, stub it clearly and document it.

## Trino Features

Support:

* `SHOW CATALOGS`
* `SHOW SCHEMAS FROM catalog`
* `SHOW TABLES FROM catalog.schema`
* column metadata using `information_schema.columns`
* query execution
* query timeout
* readable errors
* default query limits
* query history
* query duration
* row count fetched
* SQL preview before execution

---

# Notebook Experience

The UI must be notebook-first.

## Supported Cell Types

Implement these cell types in models:

* Markdown cell
* SQL cell
* AI prompt cell
* Visualization cell
* Knowledge note cell

Python cell can be planned for later unless the chosen framework makes it easy.

## SQL Cell Requirements

Each SQL cell should support:

* connection selector
* SQL editor
* run button
* stop/cancel button if possible
* result table
* result profiling
* chart creation
* AI explain SQL
* AI optimize SQL
* AI generate chart suggestion
* send result to Knowledge Notebook
* create infographic from result
* export result as CSV
* save result as local dataframe/cache artifact

## Notebook Operations

Support:

* add cell
* delete cell
* duplicate cell
* move cell up/down
* run single cell
* run all cells
* save notebook as JSON
* load notebook JSON
* export notebook as HTML or markdown if feasible

Notebook JSON should store:

* notebook metadata
* cell list
* SQL content
* markdown content
* chart configs
* knowledge source references
* result artifact references, not necessarily full result data

---

# Ultra-HD Visualization

Create a visualization module using Plotly unless there is a better practical choice.

## Chart Types

Support:

* line chart
* bar chart
* stacked bar chart
* area chart
* scatter plot
* pie chart
* donut chart
* heatmap
* histogram
* box plot
* time-series chart
* KPI card
* formatted table

## Chart Builder

The chart builder should allow:

* x-axis
* y-axis
* color/group
* aggregation
* filters
* title
* subtitle
* chart theme
* export format

## Auto Chart Suggestions

Based on dataframe column types, suggest charts:

* date/time + numeric → line chart
* category + numeric → bar chart
* two numeric columns → scatter plot
* category distribution → bar/pie
* matrix-like data → heatmap
* single metric → KPI card

## Export

Support:

* HTML export
* SVG export if feasible
* PNG export if feasible
* 2x or 4x scale export where supported

Warn users before visualizing very large result sets.

---

# AI Assistant

AI must be provider-agnostic.

## AI Providers

Create an interface:

```python
class AIProvider:
    def generate_sql(self, prompt: str, context: AIContext) -> str: ...
    def explain_sql(self, sql: str, context: AIContext) -> str: ...
    def optimize_sql(self, sql: str, context: AIContext) -> str: ...
    def suggest_chart(self, dataframe_schema: DataFrameSchema, sample: list[dict]) -> ChartSuggestion: ...
    def summarize_result(self, context: ResultContext) -> str: ...
    def generate_infographic_brief(self, context: InfographicContext) -> InfographicBrief: ...
```

Implement:

* MockAIProvider
* Optional OpenAIProvider using env vars
* Optional AnthropicProvider using env vars
* Optional OllamaProvider for local models

Do not require real AI keys for local startup.

## AI Features

Support:

* natural language to SQL
* SQL explanation
* SQL optimization
* join suggestions from metadata
* chart suggestion
* result summary
* executive summary
* anomaly explanation
* data quality issue detection
* business question suggestions
* markdown report generation

## Important AI Safety Rules

* AI-generated SQL must never execute automatically.
* Always show generated SQL to the user first.
* Block or warn on write/destructive SQL.
* Never send credentials to AI.
* Mask secrets in logs and prompts.
* Default AI context mode should be schema + aggregated stats only.
* Do not send raw rows unless user explicitly enables it.
* Add a preview of what context will be sent to AI.

---

# SQL Safety Guard

Create `security/sql_guard.py`.

Default mode: read-only analytics.

Dangerous SQL keywords:

* DELETE
* UPDATE
* INSERT
* MERGE
* DROP
* TRUNCATE
* ALTER
* CREATE
* GRANT
* REVOKE
* CALL
* EXECUTE

Behavior:

* SELECT queries allowed by default.
* EXPLAIN queries allowed.
* SHOW/DESCRIBE allowed.
* DESCRIBE/SHOW metadata queries allowed.
* Write/destructive queries blocked unless `ALLOW_WRITE_QUERIES=true`.
* Even if writes are allowed, show a warning before execution.

Use SQLGlot if useful, but also include a robust fallback keyword scanner.

---

# Metadata Explorer

Create a left-side metadata explorer.

It should show:

* saved connections
* catalogs
* schemas
* tables
* columns
* column types
* nullable flag if available
* search box
* favorite tables

On table click:

* show schema
* show sample rows
* show profile
* show example SQL
* send schema to Knowledge Notebook
* ask AI about table
* generate starter queries

---

# Data Profiling

Create profiling for query results and previews.

Include:

* row count
* column count
* null count
* null percentage
* distinct count
* numeric min/max/mean
* date min/max
* top values
* duplicate check on selected columns
* type summary
* possible PII/sensitive column detection

## PII Detector

Use simple rule-based detection first.

Detect column names and sample patterns related to:

* email
* phone
* full name
* address
* card number
* CVV
* expiry date
* bank account
* IBAN
* SWIFT
* auth token
* access token
* refresh token
* API key
* session ID
* password hash
* OTP
* MFA secret
* device fingerprint
* GPS/location

Classify as:

* PII
* Restricted
* Not sensitive
* Unknown

Default behavior: mask restricted values before AI context sharing.

---

# Knowledge Notebook Layer

Build a NotebookLM-style internal knowledge layer.

This is separate from the SQL notebook.

The SQL notebook is where users query and visualize data.

The Knowledge Notebook is where users collect selected sources, summaries, result explanations, business definitions, and infographic briefs.

## Modes

Implement two modes:

### Mode A: Internal Knowledge Notebook

This must work in MVP.

It stores:

* SQL query
* result schema
* aggregated result summary
* sampled rows if allowed
* profiling output
* chart configs
* chart textual explanation
* markdown notes
* AI-generated summaries
* infographic briefs

Store locally as JSON files or SQLite/DuckDB.

### Mode B: NotebookLM Enterprise Provider

Design the interface now, but make the actual implementation optional.

Rules:

* Use only official Google Cloud NotebookLM Enterprise APIs.
* Do not rely on unofficial browser automation.
* Do not scrape NotebookLM UI.
* Keep this feature disabled unless credentials/config are provided.
* Mark this provider experimental because API availability/access may depend on Google Cloud/Enterprise setup.

## Knowledge Models

Create:

```python
class KnowledgeNotebook:
    id: str
    name: str
    description: str | None
    provider_type: Literal["internal", "notebooklm_enterprise"]
    external_notebook_id: str | None
    created_at: datetime
    updated_at: datetime

class KnowledgeSource:
    id: str
    notebook_id: str
    source_type: Literal[
        "sql_query",
        "query_result",
        "chart",
        "markdown",
        "schema",
        "profile",
        "uploaded_file",
        "web_link",
        "business_definition"
    ]
    title: str
    content: str
    metadata: dict
    external_source_id: str | None
    created_at: datetime

class Infographic:
    id: str
    notebook_id: str
    title: str
    source_ids: list[str]
    layout_config: dict
    chart_configs: list[dict]
    narrative: str
    export_paths: list[str]
    created_at: datetime
```

## Knowledge Notebook UI

Add a right-side panel called **Knowledge Notebook**.

It should show:

* current knowledge notebook
* sources added
* source type
* created time
* AI chat over selected sources
* infographic generator
* summary generator
* export report button

Each SQL cell should have buttons:

* Add SQL to Knowledge Notebook
* Add Result Summary to Knowledge Notebook
* Add Schema to Knowledge Notebook
* Add Chart to Knowledge Notebook
* Create Infographic
* Create Stakeholder Summary
* Explain with AI

---

# Infographic Generator

Create an AI-assisted infographic generator.

The user can click:

> Create Infographic

The app should generate:

* infographic title
* key metrics
* 3–5 main insights
* recommended charts
* suggested layout
* short narrative
* data caveats
* exportable report

## Templates

Support these templates:

* Executive KPI Brief
* Trend Analysis
* Funnel Analysis
* Cohort Analysis
* Cost Optimization Report
* Data Quality Report
* Revenue Breakdown
* Operational Performance Summary

## Infographic Output

Create an HTML-based infographic first.

Include:

* title
* summary cards
* charts
* narrative
* caveats
* source references

Export options:

* HTML first
* PNG if feasible
* PDF later
* SVG later

Do not block MVP on PDF export.

---

# AI Context Control

Before sending data to any AI provider or external knowledge provider, provide context controls:

* Send schema only
* Send aggregated summary only
* Send sample rows
* Send full result only if explicitly allowed
* Mask PII
* Exclude restricted columns
* Do not send credentials
* Do not send secrets
* Show preview of what will be sent

Default:

* schema + aggregated stats only
* no raw sensitive data
* no credentials
* no secrets
* no restricted columns

---

# Future Connector Architecture

Design connectors using a registry/plugin model.

Initial connector:

* Trino

Future connectors:

* PostgreSQL
* MySQL
* BigQuery
* Snowflake
* Redshift
* Athena
* Databricks SQL
* DuckDB
* ClickHouse
* CSV upload
* Excel upload
* Google Sheets

Every connector should follow the same base interface.

---

# Performance Requirements

The app must be safe for large datasets.

Implement:

* preview limit
* query result limit
* query timeout
* optional query cache
* warning before loading large result sets
* warning before plotting large result sets
* chunked fetch if practical
* local artifact storage for results
* avoid keeping huge dataframes in memory unnecessarily

Defaults:

* preview rows: 100
* max result rows: 10,000
* query timeout: 300 seconds
* chart warning threshold: 10,000 rows

---

# Config and Environment Variables

Create `.env.example` with:

```env
APP_NAME=RedNotebook AI
APP_ENV=local

ALLOW_WRITE_QUERIES=false
DEFAULT_PREVIEW_ROWS=100
DEFAULT_MAX_RESULT_ROWS=10000
DEFAULT_QUERY_TIMEOUT_SECONDS=300

TRINO_HOST=
TRINO_PORT=443
TRINO_SCHEME=https
TRINO_USER=
TRINO_PASSWORD=
TRINO_CATALOG=
TRINO_SCHEMA=
TRINO_VERIFY_SSL=true
TRINO_CA_CERT_PATH=

AI_PROVIDER=mock
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

AI_CONTEXT_MODE=schema_and_stats
AI_ALLOW_SAMPLE_ROWS=false
AI_SAMPLE_ROW_LIMIT=20
AI_MASK_PII=true

KNOWLEDGE_PROVIDER=internal

NOTEBOOKLM_ENTERPRISE_ENABLED=false
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=global
NOTEBOOKLM_ENDPOINT_LOCATION=global
```

Never commit real credentials.

---

# CLI

Create a CLI using Typer.

Commands:

```bash
rednotebook run
rednotebook validate-config
rednotebook test-trino
rednotebook profile-file path/to/file.csv
rednotebook export-notebook path/to/notebook.json
```

---

# README Requirements

README must include:

* project name
* short positioning
* feature list
* screenshots placeholder
* quick start
* local setup
* Docker setup
* Trino HTTPS config example
* AI setup
* Knowledge Notebook explanation
* security model
* connector roadmap
* contribution guide
* license

Add a clear warning:

> RedNotebook AI is read-only by default. Write queries are blocked unless explicitly enabled.

---

# Documentation Requirements

Create docs:

## docs/architecture.md

Explain:

* app architecture
* module boundaries
* data flow
* connector flow
* AI flow
* knowledge notebook flow

## docs/connectors.md

Explain:

* base connector interface
* Trino connector
* how to add future connectors

## docs/ai.md

Explain:

* provider abstraction
* context controls
* SQL generation safety
* local model support

## docs/security.md

Explain:

* secret handling
* SQL guard
* AI context masking
* PII detection
* external provider risks

## docs/notebooklm_integration.md

Explain:

* internal knowledge notebook mode
* optional NotebookLM Enterprise provider
* no unofficial scraping
* source upload strategy
* limitations

## docs/visualization.md

Explain:

* chart types
* chart recommendation logic
* export options

## docs/roadmap.md

Include:

* more connectors
* team collaboration
* cloud-hosted version
* Git-backed notebooks
* scheduled queries
* alerts
* dashboard publishing
* dbt integration
* Airflow integration
* semantic layer
* RBAC
* SSO
* hosted SaaS version

---

# Testing Requirements

Add tests for:

* SQL guard
* Trino connector config creation
* base connector interface behavior
* notebook model serialization
* knowledge notebook model serialization
* PII detector
* profiler
* AI context builder
* chart recommender

Tests should not require a real Trino server by default.

Mock Trino for tests.

---

# Code Quality Rules

Use:

* type hints
* Pydantic models
* clear module boundaries
* readable error messages
* secure defaults
* minimal global state
* no hardcoded credentials
* no unnecessary complexity

Run:

```bash
ruff check .
pytest
```

If the chosen framework requires different commands, document them.

---

# UI Quality Bar

The UI should feel premium and polished.

Required layout:

* left sidebar: connections and metadata explorer
* center: notebook canvas
* right sidebar: AI assistant and Knowledge Notebook
* bottom/inline: result tables and charts

Design requirements:

* clean typography
* clear spacing
* dark/light mode if easy
* loading indicators
* query status
* errors in human-readable format
* result tabs: Table / Profile / Chart / AI / Knowledge

---

# Implementation Strategy

Work in phases.

## Phase 1

Build the working local MVP.

## Phase 2

Improve chart builder, AI providers, and knowledge notebook.

## Phase 3

Add more connectors.

## Phase 4

Add collaboration, Git-backed notebooks, and dashboard publishing.

When implementing, always prioritize a working end-to-end product over incomplete advanced features.

---

# First Task for Claude Code

When starting implementation, do this:

1. Create the repo structure.
2. Implement core models.
3. Implement config loading.
4. Implement SQL guard.
5. Implement Trino connector.
6. Implement notebook storage.
7. Implement mock AI provider.
8. Implement profiler and PII detector.
9. Implement visualization recommender.
10. Implement internal knowledge notebook.
11. Implement app UI.
12. Add tests.
13. Add README and docs.
14. Run lint/tests.
15. Summarize what works and what remains.

Do not ask for unnecessary clarification. Make reasonable engineering decisions and document them.

---

# Acceptance Criteria

The MVP is acceptable only if:

* The app starts locally.
* User can configure Trino HTTPS.
* User can test connection.
* User can browse metadata.
* User can run a SQL query.
* User can see results.
* User can create at least one chart.
* User can get AI mock suggestions.
* User can save/load notebook JSON.
* User can send result summary to Knowledge Notebook.
* User can generate a basic infographic HTML report.
* SQL guard blocks destructive queries by default.
* Tests pass.
* README explains setup clearly.

---

# Final Instruction

Build the project as a serious open-source MVP.

Prefer clean, working, extensible implementation over flashy but broken code.

If a feature is too large for the first pass, create a clean interface, implement a safe stub, document the limitation, and continue building the working MVP.

