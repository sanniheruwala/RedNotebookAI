# AI

## Provider abstraction

`rednotebook.ai.base.AIProvider` defines a single interface:

- `generate_sql(prompt, context)`
- `explain_sql(sql, context)`
- `optimize_sql(sql, context)`
- `suggest_chart(schema, sample)`
- `summarize_result(context)`
- `generate_infographic_brief(context)`

Implementations register themselves at import time:

- `MockAIProvider`, deterministic, offline. Always available.
- `OpenAIProvider`, requires `OPENAI_API_KEY` and the `openai` package.
- `AnthropicProvider`, requires `ANTHROPIC_API_KEY` and the `anthropic` package.
- `OllamaProvider`, requires a running Ollama server (no extra deps).

The registry returns `MockAIProvider` whenever the configured provider can't
be instantiated. Local development is always frictionless.

## Privacy controls

`AIContext` builds privacy-safe payloads:

| Mode | Schema | Aggregated stats | Sample rows |
|------|--------|------------------|-------------|
| `schema_only` | ✅ |, |, |
| `schema_and_stats` (default) | ✅ | ✅ |, |
| `schema_stats_samples` | ✅ | ✅ | only when `AI_ALLOW_SAMPLE_ROWS=true` |

When samples are included, PII / Restricted columns are masked. Secrets are
stripped from SQL before any provider call.

## SQL generation safety

- Generated SQL is **never executed automatically**, it shows up in the
  notebook for the user to inspect first.
- Writes are blocked unless `ALLOW_WRITE_QUERIES=true` and even then require
  explicit confirmation.
- Credentials are never forwarded to AI providers.

## Local models

`OllamaProvider` uses Ollama's HTTP API directly (no extra dependencies). Set
`AI_PROVIDER=ollama` and `OLLAMA_BASE_URL=http://localhost:11434`.
