# v0.7.21 — onboarding conversion + hosted-demo prep

This release is about the first five minutes for a new user: faster
connection setup, a tour that explains what the canvas does, a
concrete "start here" panel instead of a blank slate, and bundled
sample notebooks so a brand-new install has something to open.

It also adds the plumbing for a public demo at `try.rednotebook.app`.

## Highlights

### 🚀 Quick-connect templates

The connection dialog now leads with a "Quick connect" strip of
branded tiles for **Supabase, Neon, Vercel Postgres, Railway, Render,
Heroku Postgres, and DuckDB**. Each pre-fills the right port, SSL
mode, default database, and username so users only have to drop in
host + password. Saves five fields of fiddling per new connection.

Generic per-connector tiles still live below for the long-tail cases.

### 🎓 Onboarding tour

A hand-rolled spotlight overlay walks first-time visitors through the
seven moments that matter: the SQL cell, ⌘↵ to run, Summarize result,
the Files drop zone, the Knowledge drawer, Publish, and History. ~30
seconds end-to-end, skippable with Esc, resumable any time from the new
**?** icon in the topbar. Zero npm dependency added.

### 🏁 Richer empty-state for new notebooks

The empty-canvas screen is now a three-card "Start here" panel that
suggests **Drop a CSV**, **Run a SQL cell**, or **Ask AI**, each with
one-line guidance and a direct action button. Replaces the previous
single-paragraph nudge.

### 📦 Bundled sample notebook + first-run seed

A `Q3 weekly orders by region` demo notebook now ships inside the
package at `rednotebook/samples/`. On first GET to `/api/notebooks`
for a user whose storage dir is empty, the seeder copies it in (with a
fresh id so two users on a shared instance can't collide). Idempotent
— `.seeded` marker prevents re-seeding even after the user deletes
the samples.

This means the Docker image now opens to something interactive
instead of a blank slate. Also unblocks the public demo: a fresh
deploy automatically has something queryable.

### 🌐 DEMO_MODE flag

New `DEMO_MODE=true` env var. When set:
* `/api/health` exposes `demo_mode: true`
* The UI renders a thin amber banner: "You're on the public demo —
  notebooks and uploads may be wiped without notice."
* Banner is session-dismissable, links to a local install.

No behaviour change otherwise — purely a UI signal so visitors aren't
surprised by the weekly wipe.

### 📖 Fly.io deployment runbook

New `docs/deployment/try-rednotebook.md` walks through deploying
`ghcr.io/sanniheruwala/rednotebook-ai:latest` to Fly.io with the right
env, a persistent volume, a weekly wipe via GitHub Actions, and DNS
for `try.rednotebook.app`. Estimated cost: under $2/mo for a sleepy
demo.

## Upgrade notes

- New env vars (optional): `DEMO_MODE`, `UPLOADS_STORAGE_DIR`,
  `PUBLISHED_STORAGE_DIR` — all already wired in the published Docker
  image.
- `rednotebook/samples/` is shipped inside the wheel — `pip install -U`
  picks it up automatically.
- No backend API breaks.
