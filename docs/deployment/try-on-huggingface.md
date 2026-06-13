# Deploying the public demo on Hugging Face Spaces (no credit card)

Free-forever home for the live demo. **No credit card required** — a
Hugging Face account is enough. The Space runs the published Docker
image with `DEMO_MODE=true` and gives you a public URL like
`https://heruwala-rednotebook-demo.hf.space`.

Why HF Spaces over Fly.io / Render / Railway: those have all moved to
"card required" even on free tiers. HF Spaces hasn't, and it's the
*right* venue — your audience already browses Spaces for OSS data
tools.

Estimated time: ~10 minutes start to finish.

---

## What you get

- **Free** indefinitely. 2 vCPU, 16 GB RAM on the CPU free tier.
- **Auto-sleeps** after 48 h of inactivity → wakes on next request
  (~5 s cold start).
- Public HTTPS URL on `*.hf.space`. Custom domains require the paid
  ZeroGPU / PRO tier ($9/mo) — skip that for the v1 demo and link to
  the `.hf.space` URL from the README.
- **No persistent storage on free tier** — each container restart
  wipes `/data`. That's *fine* for us: matches `DEMO_MODE=true` posture,
  the sample seeder re-runs on every cold start, so the demo always
  opens to the `Q3 weekly orders` sample notebook.

---

## Step 1 — Create the Space

1. Sign in at <https://huggingface.co>.
2. Visit <https://huggingface.co/new-space>.
3. Fill in:
   - **Owner**: your HF account (`sanniheruwala`)
   - **Space name**: `rednotebook-demo`
   - **License**: Apache 2.0
   - **Space SDK**: select **Docker**
   - **Docker template**: select **Blank**
   - **Visibility**: Public
   - **Hardware**: `CPU basic · 2 vCPU · 16 GB · free`
4. Click **Create Space**. You land on an empty Space with a tab named
   **Files**.

---

## Step 2 — Drop a one-file Dockerfile shim in the Space

You don't need to rebuild the image — pull the published one. In the
Space's **Files → ＋ Contribute → Create a new file**:

**Path**: `Dockerfile`

```dockerfile
# RedNotebook AI public demo on HF Spaces.
# Pulls the prebuilt multi-arch image we publish to GHCR. Pin the tag
# (don't use `latest`) so the demo doesn't surprise-update mid-week.
FROM ghcr.io/sanniheruwala/rednotebook-ai:v0.7.21

# HF Spaces runs containers under user `user` (UID 1000). Our image's
# `redbook` user happens to also be UID 1000, so the existing chown
# on /data works without an explicit USER change.

# Demo flags: DEMO_MODE renders the amber banner; AUTH_ENABLED stays
# off so visitors don't need to sign up; AI_PROVIDER=mock so the
# Summarize / Studio buttons return deterministic stubs without
# burning anyone's API budget. All can be overridden via the Space's
# Variables UI if you want a real provider on a private fork.
ENV DEMO_MODE=true \
    AUTH_ENABLED=false \
    AI_PROVIDER=mock \
    APP_ENV=demo
```

That's the entire Space. The base image already knows how to seed the
bundled sample notebook on first request, render the demo banner, and
serve the Next.js frontend.

---

## Step 3 — Add the Space README with frontmatter

**Path**: `README.md`

```yaml
---
title: RedNotebook AI Demo
emoji: 📊
colorFrom: green
colorTo: blue
sdk: docker
pinned: false
app_port: 8000
short_description: Open-source AI data notebook for Trino, DuckDB, +11 more SQL engines
---

# RedNotebook AI — public demo

Open-source AI data notebook with SQL workspace, AI provider plug-ins,
file uploads (drop a CSV → DuckDB picks it up), one-click publish to
public HTML, and a NotebookLM-style knowledge layer.

This Space is the **public demo** — your work isn't saved between
sessions. To run it locally with persistence:

```bash
docker run -p 8000:8000 ghcr.io/sanniheruwala/rednotebook-ai:v0.7.21
```

Code, issues, and design docs:
<https://github.com/sanniheruwala/RedNotebookAI>
```

The `app_port: 8000` is critical — HF Spaces defaults to 7860,
which our image doesn't listen on. With `app_port: 8000`, HF's reverse
proxy routes traffic to the right port.

---

## Step 4 — Watch the build

Hit the Space's **App** tab. The Build log streams while HF pulls the
GHCR image. First build takes 2-3 minutes (image is ~600 MB across
all layers). After "Application startup complete", the live app
appears.

Smoke checks:
- The amber **"public demo"** banner is at the top of the page.
- The sample notebook `Q3 weekly orders by region` shows up in the
  left sidebar's Notebooks list.
- Running its SQL cell returns 54 rows.
- Clicking the **?** in the topbar replays the onboarding tour.

If the build fails:
- **"port 7860 not reachable"** → `app_port: 8000` missing from the
  README frontmatter. Fix and save; HF auto-rebuilds.
- **"Permission denied" on /data** → our image's volume mounts use
  redbook (UID 1000) which matches HF's `user`. If this still fails,
  drop `USER root` before the ENV line in the Dockerfile (HF will
  complain but the container starts).

---

## Step 5 — Share the URL

Your Space lives at:
`https://huggingface.co/spaces/heruwala/rednotebook-demo`

The bare app URL (drop the `huggingface.co/spaces/` prefix) is:
`https://heruwala-rednotebook-demo.hf.space`

Use the second one in your LinkedIn / HN / README links — it's the
direct embed without HF's wrapper UI. Update the project README's
"try it without installing" line to point at it.

---

## Pinning to a release tag

For a stable demo, replace `v0.7.21` in the Dockerfile with whichever
tag you want pinned. To roll forward to a new release:

1. Edit the Dockerfile in the Space → bump the FROM tag.
2. Save → HF auto-rebuilds.

Don't use `:latest`. A surprise rebuild during a launch is the wrong
kind of surprise.

---

## Wiping the demo

HF Spaces free tier wipes `/data` on every container restart. No cron
needed. To force a fresh restart:

1. Space's **Settings** tab → scroll to **Restart this Space**.
2. Confirm.

Cold start ~5 seconds, sample notebook re-seeded automatically.

---

## When to graduate off HF Spaces

You'd outgrow this when:

- You need persistence across restarts (Spaces Persistent Storage is
  $1/mo for 5GB — paid but cheap).
- You need a custom domain (`try.rednotebook.app`) → HF PRO at
  $9/mo, or migrate to the Fly.io runbook at
  [`./try-rednotebook.md`](./try-rednotebook.md).
- Traffic exceeds free-tier limits (HF deprioritizes free Spaces at
  high concurrency — rare for a hobby demo).

For v1: HF Spaces is the right call. Migrate later if the project
attracts steady traffic.

---

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Space says "Building…" forever | HF queue is sometimes slow. Wait 5 min. If still stuck, hit Settings → Factory rebuild. |
| App appears but shows 502 | `app_port` mismatch — must be 8000 to match our Dockerfile. |
| Sample notebook missing | Hit `/api/notebooks` once via the URL bar; the seeder runs on first list. Refresh the UI. |
| Banner not showing | `DEMO_MODE=true` env didn't make it in — verify in Settings → Variables and secrets. |
| Demo got hammered, looks slow | HF auto-scales CPU during bursts. If sustained, restart the Space to clear any stuck DuckDB sessions. |
