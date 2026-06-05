# NotebookLM-style Knowledge Layer

RedNotebook AI ships with a NotebookLM-inspired knowledge layer that lives
alongside the SQL notebook.

## Two modes

### Mode A — Internal knowledge notebook (default)

Implemented today. Backed by local JSON files. Stores:

- SQL query text
- Result schema + aggregated summary
- Optional sample rows (only if user explicitly enables)
- Profiling output
- Chart configs and textual explanations
- Markdown notes
- AI summaries
- Generated infographic briefs

This works fully offline.

### Mode B — NotebookLM Enterprise (experimental stub)

Shipped as a clean, disabled stub. We **do not** scrape NotebookLM or use
unofficial endpoints. To enable later, the user must:

- Set `NOTEBOOKLM_ENTERPRISE_ENABLED=true`
- Provide `GOOGLE_CLOUD_PROJECT`
- Pick the correct `NOTEBOOKLM_ENDPOINT_LOCATION` for their org

Until then, calls raise `NotebookLMEnterpriseNotConfigured` so it's obvious
the integration is unfinished. Marked **experimental** because access to the
Enterprise APIs depends on Google Cloud setup that may change.

## Source upload strategy

For both modes:

1. Build a `KnowledgeSource` (see `rednotebook.knowledge.source_builder`).
2. Submit it via `POST /api/knowledge/sources`.
3. The Knowledge panel in the UI lists sources by notebook and type.

## Limitations (today)

- No AI chat over knowledge sources yet (planned).
- Infographics are exported as HTML; PDF/PNG export pending kaleido + chrome.
- No collaboration / sharing yet.
