# v0.7.16

The "biggest first 5 minutes" + "show your boss" release: drop a file →
query it, click a button → share a public link.

## Highlights

### 🌐 Publish notebook → public HTML share link

One-click publish from the topbar. Renders the current notebook —
markdown, SQL, **plus the live result snapshots from your browser** —
into a single self-contained HTML page served at
`/published/<token>`. No account required to view. Each publish mints a
fresh token; old links keep working until you revoke them.

- Sets `X-Robots-Tag: noindex` so accidental shares don't get indexed.
- The HTML is fully offline — no JS, no font fetches, inline CSS, a
  dependency-free SQL highlighter. Tested at ~6 KB for a 2-cell
  notebook, ~30 KB for a notebook with a 50-row result table.
- Revoke any link from the Publish dialog.

### 📥 Drag-drop file uploads → instant DuckDB views

Drop CSV, TSV, Parquet, JSON, JSONL, or NDJSON anywhere on the app and
DuckDB attaches it as a queryable view. Dropping `customers.csv` makes
`SELECT * FROM customers` work immediately — no need to type
`read_csv_auto(...)` yourself.

- Per-user 200 MB cap. Streamed in 1 MiB chunks.
- Auto-sanitised table names (lowercase, alnum + underscore, collision
  resolution).
- File list lives in the left sidebar above Metadata.

### 📐 Design groundwork for two long-game features

Two design docs landed alongside this release, each with a tracking
issue, so contributors can pick them up:

- **[Cross-source joins via DuckDB ATTACH](docs/design/cross-source-joins.md)** —
  join Postgres + MySQL + S3 + DuckDB in a single query without
  Trino. Issue #3. ~1-2 weeks for a polished v1.
- **[Reactive notebooks (Marimo-style)](docs/design/reactive-notebooks.md)** —
  SQL-cell dependency DAG with auto-rerun of downstream cells when their
  inputs change. Issue #4. ~2-3 weeks.

## Upgrade notes

- New base dependency: `python-multipart` (required by FastAPI for the
  file upload endpoint). Existing installs need a `pip install -U
  rednotebook-ai` to pick it up.
- New on-disk dirs created on first use: `local_data/published/` and
  `local_data/uploads/<user>/`. No migration needed; both initialise
  lazily.

## Full changelog

See the auto-generated commit log at the bottom of this release.
