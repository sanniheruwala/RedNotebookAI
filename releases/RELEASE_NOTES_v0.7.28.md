# v0.7.28 — bundled optimize-SQL fix

Two bugs on the bundled provider's Optimize button, surfaced when a
real user clicked it on a DuckDB cell.

## 1. Optimize was writing fenced markdown back into the SQL cell

The frontend takes the optimize response and replaces the cell's SQL
with it directly — so the response must be parseable SQL with no
prose, no markdown, no diff. The v0.7.25 bundled prompt asked the
model for fenced SQL plus bullet-point explanations:

````
```sql
<rewritten>
```
- bullet 1
- bullet 2
````

DuckDB then choked on the leading ` ```sql ` line with `Parser Error:
syntax error at or near "\`\`\`"`.

The shared `SQL_OPTIMIZE_SYSTEM` prompt in `rednotebook/ai/prompts.py`
(used by OpenAI / Anthropic) already says **"Return ONLY the
optimized SQL (no prose, no markdown fences, no diff)"**. Aligned
bundled's prompt to that contract.

Small models love to ignore "no markdown" instructions, so we also
run the response through `_extract_sql_block` as a defensive layer
and fall back to the **original SQL** if extraction produces nothing
— better to silently keep the user's query than to overwrite their
cell with broken content.

## 2. Optimize ignored the connection dialect

`sql-cell.tsx` was calling `api.aiOptimizeSQL({ sql, context: {} })`
with an empty context. Result: even when the user was connected to
DuckDB, the AI was rewriting in generic ANSI SQL and stripping
dialect-specific tricks (DuckDB `date_trunc(...)::date` casts,
BigQuery backticks, Snowflake QUALIFY, etc).

Now passes `dialect: connection?.connector_type` so the AI knows
which engine to target. The bundled provider's optimize prompt
expands it into the system message: *"You are a senior duckdb query
optimizer…"*.

`aiGenerateSQL` was already threading dialect; this brings parity.

## What didn't change

- **Bundled model stays Qwen 1.5B**. PR #26 (which proposed
  downgrading to 0.5B for HF Space latency) was closed in favour of
  fixing the actual usability bug. If 1.5B's 30-90s on HF Space CPU
  becomes the next pain point, streaming tokens is the right move
  rather than swapping models.

## Upgrade

```bash
docker pull ghcr.io/sanniheruwala/rednotebook-ai:v0.7.28
```

HF Space: bump the `FROM` tag in the Space's Dockerfile from
`:v0.7.27` to `:v0.7.28`. Build should be fast — model layer is
cached from v0.7.27 (no GGUF change).
