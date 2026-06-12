# Design: reactive notebooks (Marimo-style auto-rerun)

**Status:** 🟡 design — accepting implementer
**Tracking issue:** TBD (filed in the GitHub issues tab)
**Estimated effort:** 2–3 weeks for a polished v1

---

## The problem

Today, if a user changes the upstream SQL cell that produces a table,
every downstream cell that consumes that table is silently stale. The
user has to remember which cells to re-run, in which order. This is the
same complaint analysts have about Jupyter, and Marimo has gained
serious traction by solving it for Python notebooks.

We can do the equivalent for SQL — detect which cells produce / consume
which tables, build a DAG, auto-rerun downstream on upstream change.

This is a real differentiator. Nobody in the SQL-notebook category does
it.

---

## What we want users to do

1. Cell A: `CREATE OR REPLACE VIEW top_customers AS SELECT * FROM customers ORDER BY revenue DESC LIMIT 10;` — runs, marks `top_customers` as produced.
2. Cell B: `SELECT region, COUNT(*) FROM top_customers GROUP BY region;` — runs, marks `top_customers` as consumed.
3. User edits Cell A's `LIMIT 10` to `LIMIT 50` and presses Run.
4. Cell A re-runs. Cell B's badge flips to "stale" momentarily, then
   B auto-runs and refreshes its result.

No user-managed "run all". No silent stale rows.

---

## Backend shape

### Per-cell dependency analysis

Parse each SQL cell with `sqlglot` (already a dep) to extract:

* **`produces`** — table / view names this cell creates or replaces
  (`CREATE [OR REPLACE] [TEMP] [TABLE|VIEW] <name>`, `INSERT INTO <name>
  SELECT …`).
* **`consumes`** — fully-qualified table names referenced in `FROM` /
  `JOIN` clauses, excluding subqueries scoped to this cell.

Both lists live on the cell in the notebook JSON:

```python
class SQLCell(_CellBase):
    ...
    produces: list[str] = []     # cached, refreshed on save
    consumes: list[str] = []
```

### Dependency graph

When the notebook is loaded (or any cell's SQL changes), rebuild a
forward graph: `produces[cell_id] → {consumer_cell_ids}`.

On a successful run of cell `X`:

* Walk descendants topologically.
* For each downstream cell, mark `running` in the store (so the UI shows
  a stale → running state).
* Submit them sequentially (or in parallel batches where the graph
  branches), respecting the same SQL guard / cancellation registry as
  manual runs.

### Cycle / ambiguity handling

| Case | Strategy |
|------|----------|
| Cycle in the graph | Detect with Tarjan; warn the user, refuse to auto-rerun the cycle. |
| Multiple cells produce the same name | Last-write-wins for dependency edges; warn in the cell header. |
| `WITH x AS (…)` CTEs collide with real table names | sqlglot's scope-aware resolver handles this. |
| Cells outside SQL (Markdown, Ask AI) | Ignored — they're not part of the DAG. |
| Auto-rerun mid-edit | Debounce: only trigger after a real "I'm done editing" signal (cell loses focus, save fires, or explicit Run on the upstream). |

### Settings

A notebook-level flag — `reactive_mode: bool` (default off). The user
can opt in per notebook. We deliberately don't make this global because
the cost on a notebook with a 30-second upstream query is real.

---

## Frontend shape

* Each SQL cell gets a small **stale** badge when one of its consumed
  tables has been re-produced since this cell last ran.
* Hovering shows the upstream chain: "stale because `cell_4` produced
  `top_customers` 3s ago."
* A toggle in the notebook settings: "Reactive mode — auto-rerun
  downstream cells when their inputs change."
* A "Show dependency graph" view (lightweight — just the produces /
  consumes badges visualized inline; no full graph viz for v1).

---

## Out of scope for v1

* **Multi-notebook reactivity** — only cells in the same notebook count
  as dependents.
* **Pause / resume of an auto-rerun chain** — the chain runs to
  completion or until the user hits Stop on a cell.
* **External table change detection** — if the underlying Postgres
  schema changes, we don't auto-rerun. That's a Phase 5 feature.

---

## Acceptance criteria

* [ ] sqlglot-backed produces/consumes resolver with ≥90% accuracy on
      a curated test set of 40 real-world SQL snippets.
* [ ] DAG construction handles `CREATE OR REPLACE TABLE`, `INSERT INTO
      SELECT`, CTEs, and `JOIN`s.
* [ ] Cycle detection refuses to auto-rerun without crashing the
      notebook.
* [ ] Reactive mode toggle in the notebook settings persists.
* [ ] Editing an upstream cell + running shows the downstream cells
      flip to "stale" then re-run.
* [ ] Manual run still works — reactive mode adds to, never replaces,
      the existing run flow.
* [ ] Unit tests for the resolver + DAG builder.
* [ ] One E2E test that walks a 3-cell chain end-to-end.

---

## Why this is genuinely large

The dependency graph is the easy part. The hard parts:

1. **Race conditions** — what if the user hits Stop on cell 5 of a
   7-cell auto-rerun? Need to cancel downstream-of-5 cleanly without
   leaving the store in a half-stale state.
2. **Result invalidation** — restoring an older notebook version via
   the History dialog should not trigger a 30-cell re-run.
3. **UX clarity** — a cell that's "auto-rerunning right now" must look
   different from "you ran it" so users don't fight the system.
4. **Telemetry-free debugging** — when something doesn't auto-rerun, the
   user needs a hint why (no produces match? cycle? reactive mode off?).

Plan for 2–3 weeks rather than 2–3 days. This is a flagship feature; if
we ship a half-baked version it'll hurt the project more than help.
