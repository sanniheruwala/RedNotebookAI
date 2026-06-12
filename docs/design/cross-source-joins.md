# Design: cross-source joins via DuckDB ATTACH

**Status:** 🟡 design — accepting implementer
**Tracking issue:** TBD (filed in the GitHub issues tab)
**Estimated effort:** 1–2 weeks for a polished v1

---

## The problem

Today a RedNotebook AI user picks one connection per notebook and queries
it. Joining data across two sources (e.g. Postgres `orders` with an S3
Parquet `enrichment.parquet`) means either standing up Trino + Iceberg or
shuttling data through a manual ETL.

The only tool that does cross-source joins natively in the analyst-facing
notebook category is Trino — which adds operational cost most teams don't
want to pay. **DuckDB 1.0 can do this without Trino**: ATTACH any
Postgres, MySQL, SQLite, or S3 source as a catalog inside a DuckDB
connection, then write one query that touches all of them.

We have the connectors. We have DuckDB. Nobody's surfaced this in a
notebook UI yet. That's the moat.

---

## What we want users to do

1. Open or create a DuckDB connection in the sidebar.
2. Click **Attach source** — a small popover lists every saved
   connection (Postgres, MySQL, S3 bucket, BigQuery, …).
3. Pick one and give it a catalog name (e.g. `pg`).
4. Write a single query: `SELECT * FROM pg.public.orders o JOIN
   enrichment e ON e.order_id = o.id LIMIT 50;`

That's the entire UX. The notebook still has *one* active connection (the
DuckDB one); the attached sources are just extra catalogs under it.

---

## Backend shape

### Storage

Extend `DuckDBConnectionConfig` with an `attachments` list:

```python
class AttachmentConfig(BaseModel):
    """One source ATTACH-ed to a DuckDB connection."""
    catalog_name: str             # SQL identifier (`pg`, `lake`, …)
    source_kind: Literal[
      "postgresql", "mysql", "sqlite", "duckdb",
      "s3-parquet", "s3-csv"
    ]
    # The actual ATTACH string-builder reuses our existing connection
    # payloads where possible — postgresql attachments draw from the
    # encrypted ConnectionStore instead of plain credentials.
    saved_connection_id: str | None = None
    options: dict[str, Any] = {}

class DuckDBConnectionConfig(...):
    attachments: list[AttachmentConfig] = []
```

### Connector hook

In `DuckDBConnector._connect()` (after the connection opens, before
upload views), emit one `ATTACH` per attachment:

```sql
ATTACH 'postgresql://user:pwd@host/db' AS pg (TYPE POSTGRES);
ATTACH 's3://bucket/data/*.parquet' AS lake (TYPE PARQUET);
INSTALL httpfs; LOAD httpfs;  -- if S3 anywhere in attachments
```

For credentialed sources, build the DSN from the encrypted
`ConnectionStore` entry referenced by `saved_connection_id`. Never
embed plaintext credentials in `DuckDBConnectionConfig`.

### Routes

* `POST /api/connections/duckdb/{id}/attach` — adds an attachment to a
  saved DuckDB connection.
* `DELETE /api/connections/duckdb/{id}/attach/{catalog_name}` — removes
  one.

### Edge cases

| Case | Strategy |
|------|----------|
| Attached source is offline | DuckDB ATTACH fails; we catch, surface a clear warning in the metadata sidebar, query still runs against other attachments. |
| Catalog name collides | Validation rejects: `lake` is taken. Suggest the next free name. |
| User has saved connections that point at the *same* DuckDB file | Block — ATTACH'ing a file to itself crashes DuckDB. |
| S3 attachments need region/keys | Reuse env (`AWS_*`) or honour an S3-attachment payload with explicit creds, encrypted via `ConnectionStore`. |
| Schema metadata | Extend `list_schemas` / `list_tables` to walk attached catalogs so the metadata explorer shows them under the same tree. |

---

## Frontend shape

* New **Attach source** button on the DuckDB connection edit dialog.
* Popover: pick from saved connections + name the catalog.
* Metadata sidebar gains a top-level group per attached catalog with a
  small unmount (×) icon.
* Query autocompletion suggests `<catalog>.<schema>.<table>` once a
  catalog is attached.

---

## Out of scope for v1

* **Pushdown hints / query planning** — DuckDB handles this; don't
  reinvent.
* **Caching attached source metadata** — defer until profiles show
  schema listings are slow on production.
* **Write-back to attached sources** — read-only by default, matching
  the SQL guard's posture.

---

## Acceptance criteria

* [ ] Can ATTACH a saved Postgres connection to a DuckDB notebook from
      the UI without touching `.env`.
* [ ] Can query `SELECT * FROM pg.public.orders LIMIT 10` and get rows.
* [ ] Metadata sidebar shows attached catalogs alongside the local DuckDB
      ones.
* [ ] Removing an attachment from the UI revokes it on next query (no
      stale references).
* [ ] Failed attachments don't kill the whole query — they're surfaced as
      a warning, other attachments stay live.
* [ ] At least one E2E test in `tests/` that ATTACH-es a temporary
      SQLite file and joins it against an in-memory DuckDB table.
