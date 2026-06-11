# v0.7.15

A large sprint focused on closing Phase 2 polish items and tightening the
contribution policy.

## Highlights

- **Server-side query cancellation.** The Stop button now actually reaches
  the engine. DuckDB uses `interrupt()`, Trino uses `cursor.cancel()`,
  Postgres / Redshift use `pg_cancel_backend(pid)`, MySQL / MariaDB use
  `KILL QUERY pid`. Other dialects keep the previous behaviour (abort
  the HTTP request; engine finishes on its own) with an explicit
  `supports_cancellation()` capability flag.
- **Autosave + git-backed history.** Every notebook directory is now a
  per-user git repo. Saves are autocommits, so the new History dialog
  shows a real timeline of every change with one-click restore. Autosave
  is debounced for cell edits, immediate on cell add/remove/move and on
  successful query execution.
- **NotebookLM-style knowledge.** Chat answers now emit `[n]` citation
  markers that render as clickable chips and scroll to the cited source
  card. A new **Studio** dialog generates Overview / FAQ / Study guide /
  Suggested follow-up questions from the notebook's sources in one call.
- **Richer profiling.** Per-column histograms (sparkline-rendered) and a
  "Related columns" panel ranked by normalised mutual information.
- **PDF / PNG infographic export** via headless Chromium. Install
  `rednotebook-ai[exports]` and run `playwright install chromium`, then
  use the new PDF / PNG buttons in the infographic modal.
- **Cursor AI provider.** OpenAI-compatible endpoint with configurable
  `CURSOR_BASE_URL`, so any compatible gateway plugs in.
- **Summarize result** replaces the in-cell Explain SQL button. The new
  system prompt produces a deep numeric briefing (Headline, Numbers
  worth knowing, Key findings, Distribution shape, Anomalies, Suggested
  next questions) from the actual result, not the SQL.
- **Connection control unified in the left sidebar.** Removed from the
  topbar to cut UI duplication.

## Contribution policy

This release also formalises how the project accepts contributions:

- `main` is now a **protected branch**. Every change requires a PR with
  green CI **and** an approving review from a maintainer listed in
  [`.github/CODEOWNERS`](./.github/CODEOWNERS). Direct pushes to `main`
  are blocked.
- Non-trivial PRs must reference an issue. The PR template and
  CONTRIBUTING guide both call this out.
- See [`docs/contributing.md`](./docs/contributing.md) for the full
  flow and the project's "what we say no to" list.

## Upgrade notes

- New optional extra `[exports]` pulls Playwright for PDF / PNG
  rendering. Existing installs that don't need it can ignore it.
- The notebook storage directory becomes a git repo on first save. No
  manual migration needed — the wrapper initialises lazily and skips
  cleanly when git is unavailable.

## Full changelog

See the auto-generated commit log at the bottom of this release.
