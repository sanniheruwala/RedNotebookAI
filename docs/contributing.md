# Contributing to RedNotebook AI

Thanks for your interest. RedNotebook AI is an open-source project and
welcomes contributions of every shape — bug reports, docs, tests, new
features, connectors, and AI providers. To keep the project healthy we
follow the standard open-source flow: **issue first, then PR, with a
maintainer review and approval before anything lands on `main`**.

---

## Quick links

- 🐛 [Open a bug report](https://github.com/sanniheruwala/RedNotebookAI/issues/new?template=bug_report.yml)
- 💡 [Propose a feature](https://github.com/sanniheruwala/RedNotebookAI/issues/new?template=feature_request.yml)
- 🔒 [Report a security issue privately](../SECURITY.md)

---

## The contribution flow

```
 ┌──────────┐    ┌────────┐    ┌────────────┐    ┌──────────────┐    ┌────────┐
 │  Issue   ├──▶ │  Fork  ├──▶ │  Branch    ├──▶ │  PR + review ├──▶ │ Merge  │
 │  first   │    │ + clone│    │ + commits  │    │ (approval)   │    │ to main│
 └──────────┘    └────────┘    └────────────┘    └──────────────┘    └────────┘
```

### 1. Open (or pick up) an issue first

For anything beyond a typo fix, **open an issue before writing code**.
This is the cheapest place to align on:

- whether the change fits the project's scope (read-only safety,
  local-first, no telemetry, premium UI, lean backend),
- whether someone else is already working on it,
- the shape of the fix or feature.

If you're new and want a starting point, look for issues labelled
[`good first issue`](https://github.com/sanniheruwala/RedNotebookAI/labels/good%20first%20issue)
or [`help wanted`](https://github.com/sanniheruwala/RedNotebookAI/labels/help%20wanted).

Drive-by PRs with no linked issue may be closed without review — not as
a snub, but because we've found alignment costs less *before* the code
exists than after.

### 2. Fork and clone

```bash
gh repo fork sanniheruwala/RedNotebookAI --clone
cd RedNotebookAI
git remote add upstream https://github.com/sanniheruwala/RedNotebookAI.git
```

### 3. Set up your environment

```bash
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cd frontend && npm install
cd ..
cp .env.example .env
```

### 4. Branch from `main`

Use a descriptive name. Conventions used in this repo:

```
feat/<short-desc>     # new feature
fix/<short-desc>      # bug fix
docs/<short-desc>     # documentation
refactor/<short-desc> # restructuring without behaviour change
chore/<short-desc>    # tooling, deps, CI
```

```bash
git fetch upstream
git checkout -b feat/snowflake-pushdown upstream/main
```

### 5. Write the change

- **One PR, one concern.** Resist the urge to bundle unrelated cleanups
  into a feature PR — they make review slower and harder to revert.
- **Add or update tests** when you change behaviour. Backend: `pytest`
  (see `tests/`). Frontend: type + lint coverage is the minimum;
  Playwright E2E tests are welcome for UI flows.
- **Update docs** when you change user-facing behaviour. README,
  `docs/`, or the relevant module docstring — whichever is closest.

### 6. Commit using Conventional Commits

```
feat(connectors): add Athena via SQLAlchemy
fix(ai): preserve markdown fences in Ask AI responses
docs(deployment): clarify rate-limit defaults
chore(deps): bump pydantic to 2.7
```

The leading type matters — the release-note generator groups commits
by type, and reviewers scan the prefix first.

### 7. Run the checks locally before opening the PR

```bash
# Backend
pytest
ruff check .

# Frontend
cd frontend
npm run lint
npm run typecheck
npm run build
cd ..
```

CI runs all of these on every PR. Failing CI blocks merge; please don't
push fixes serially — squash locally first.

### 8. Open the PR

- Title: same format as a Conventional Commit subject.
- Description: use the PR template — `Summary`, `Type of change`,
  `How I tested this`, `Screenshots / API examples`, and the
  `Checklist`.
- **Link the issue** in the description (`Closes #123`). PRs without a
  linked issue are eligible to be closed.
- Mark as Draft until you're done iterating.

### 9. Review and approval

`main` is a **protected branch**. Every change requires:

- ✅ Green CI (`backend (Python 3.11 + 3.12)` and
  `frontend (Node 20 + 22)`).
- ✅ At least **one approving review** from a maintainer listed in
  [`.github/CODEOWNERS`](../.github/CODEOWNERS).
- ✅ No unresolved review comments.
- ✅ The branch must be up to date with `main` (you may need to
  `git rebase upstream/main`).

Direct pushes to `main` are blocked even for admins. The only path in
is through a PR. Plan for one or two review rounds — please don't
take feedback personally; it's part of how we keep the codebase
coherent.

### 10. After merge

- Delete your branch.
- The maintainer will decide when to cut the next release; you don't
  need to bump the version yourself.

---

## What we say "no" to

Some of these are non-negotiable for the project:

- **Telemetry / phone-home.** RedNotebook AI does not call out without
  the user asking it to. Provider SDKs (OpenAI / Anthropic /
  Ollama) only fire when the user explicitly triggers an AI surface.
- **Bypassing the read-only SQL guard.** The guard exists to keep
  exploratory queries from mutating warehouses. Changes that loosen
  the default need explicit design discussion in an issue first.
- **Hard dependencies on a single vendor.** New connectors are great;
  vendor-only abstractions are not.
- **Massive unrelated reformatting.** Run `ruff format` and Prettier
  locally — but keep the diff focused on what the PR is actually
  changing.

If you're unsure whether your idea fits, open an issue and ask before
you spend an afternoon on it.

---

## Reporting security issues

**Do not open a public issue for security vulnerabilities.** See
[`SECURITY.md`](../SECURITY.md) for the private disclosure channel and
the response SLA.

---

## Maintainer rights

Maintainers reserve the right to:

- Close PRs that have no linked issue or that have been inactive for
  more than 30 days (with a comment, never silently).
- Request scope reduction on PRs that bundle unrelated changes.
- Reject features that don't fit the project's design principles —
  even if they're well-implemented.

We try to be transparent about *why* every time. If a decision feels
arbitrary, push back in the PR thread — we want to learn from it.

---

## Code of conduct

Be kind. Assume good intent. Critique code, not people. If something
in the project's communication makes you feel unwelcome, please reach
out privately to the maintainers via the email in
[`SECURITY.md`](../SECURITY.md).
