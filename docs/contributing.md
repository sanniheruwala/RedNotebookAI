# Contributing

PRs are welcome — RedNotebook AI is an open-source project.

## Setup

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd frontend && npm install
```

## Style

- Python: type hints, Pydantic models, small focused modules
- TypeScript: strict mode, no implicit any
- Run `ruff check .` and `pytest` before opening a PR
- Run `npm run lint` and `npm run typecheck` in `frontend/`

## Commit conventions

Use Conventional Commits when possible:

```
feat: add Snowflake connector
fix: prevent SQL guard from missing UPSERT
docs: clarify AI privacy modes
```

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. Email
the maintainers privately.

## Reviewing principles

- Read-only safety is non-negotiable.
- No telemetry, no surprise network calls.
- Keep the UI premium and the backend lean.
- Document any new external dependency.
