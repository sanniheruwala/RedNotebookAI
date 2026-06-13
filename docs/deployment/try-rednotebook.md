# Deploying the public demo at `try.rednotebook.app`

A step-by-step for hosting a read-and-play demo instance of RedNotebook
AI on **[Fly.io](https://fly.io)**. The demo runs the published Docker
image with `DEMO_MODE=true`, a small persistent volume for transient
notebooks + uploads, and a weekly job that wipes everything back to the
bundled samples so a misuse can't compound.

Estimated time: ~25 minutes the first time, ~2 minutes on every later
deploy. Cost on Fly's free tier: $0 for an idle app + ~$2/mo if you keep
the volume + scale 256MB always-on.

---

## What the demo actually shows

* **App**: `ghcr.io/sanniheruwala/rednotebook-ai:latest` (or pin to a
  specific `v0.7.X` tag for stability)
* **Mode**: `AUTH_ENABLED=false` (single shared workspace, no signup)
  + `DEMO_MODE=true` (banner renders telling visitors not to expect
  persistence)
* **Data on disk**: lazy-seeded with the bundled sample notebooks the
  first time anyone hits `/api/notebooks`. Wiped weekly via cron.
* **No real AI provider keys**. `AI_PROVIDER=mock` so the demo can show
  every AI surface end-to-end without burning your OpenAI / Anthropic
  budget. Visitors who want a real provider install locally.

---

## Prereqs

1. **Fly.io CLI** installed:
   `brew install flyctl` (macOS) or `curl -L https://fly.io/install.sh | sh`
2. **Sign in**: `fly auth login` (creates a Fly account if you don't
   have one).
3. **DNS**: ownership of `rednotebook.app` so you can point
   `try.rednotebook.app` at the Fly app. If you only own a different
   domain, swap it in every step below.

---

## Step 1 — Drop a `fly.toml` at the repo root

Save the following as `fly.toml`. Tweak `app` if `rednotebook-demo` is
taken; Fly will tell you on `fly launch`.

```toml
app = "rednotebook-demo"
primary_region = "iad"  # us-east-1; pick the region closest to your majority audience

[build]
  image = "ghcr.io/sanniheruwala/rednotebook-ai:latest"

[env]
  DEMO_MODE = "true"
  AUTH_ENABLED = "false"
  AI_PROVIDER = "mock"
  APP_ENV = "demo"
  # Override every storage path so they all live on the persistent volume
  # mounted at /data (see [mounts] below). Without this they'd land
  # under /app/local_data and disappear on every redeploy.
  NOTEBOOK_STORAGE_DIR = "/data/notebooks"
  KNOWLEDGE_STORAGE_DIR = "/data/knowledge"
  AUTH_STORAGE_DIR = "/data/auth"
  ARTIFACTS_DIR = "/data/artifacts"
  EXPORTS_DIR = "/data/exports"
  CONNECTION_STORAGE_DIR = "/data/connections"
  AUDIT_STORAGE_DIR = "/data/audit"
  RUNTIME_CONFIG_DIR = "/data/admin"
  UPLOADS_STORAGE_DIR = "/data/uploads"
  PUBLISHED_STORAGE_DIR = "/data/published"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = "stop"
  auto_start_machines = true
  min_machines_running = 0           # let it scale to zero when idle

  [http_service.concurrency]
    type = "requests"
    hard_limit = 50
    soft_limit = 40

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512                    # 256MB works for the API but Plotly + DuckDB are happier with 512

[mounts]
  source = "rednotebook_data"
  destination = "/data"
  initial_size_gb = 1
```

---

## Step 2 — Launch the app

```bash
fly launch --no-deploy --copy-config
```

`--no-deploy` keeps Fly from rolling out before you've created the
volume. `--copy-config` tells it to use the `fly.toml` you just wrote
instead of asking interactively.

When it prompts for a region, hit Enter (uses `primary_region` from
the config).

---

## Step 3 — Create the volume

```bash
fly volumes create rednotebook_data --region iad --size 1
```

(Or whatever region you set above.)

---

## Step 4 — First deploy

```bash
fly deploy
```

Watch the logs:

```bash
fly logs
```

When you see `Uvicorn running on http://0.0.0.0:8000`, the app is live
at `https://<app>.fly.dev`. Click through it and confirm:

* The amber **"public demo"** banner appears at the top.
* The bundled sample notebook (`Q3 weekly orders by region`) is in the
  left sidebar's Notebooks list — it auto-seeded on first request.
* Drag a CSV onto the app → `SELECT * FROM <name>` works.
* Hit **Publish** on a notebook → public link renders charts.

---

## Step 5 — Point `try.rednotebook.app` at it

```bash
fly certs create try.rednotebook.app
fly certs show try.rednotebook.app
```

The second command prints the **two DNS records** Fly wants you to
create at your registrar. Two common shapes:

* **A record**: `try` → `<ipv4>` (Fly gives you the IP)
* **AAAA record**: `try` → `<ipv6>`
* **CNAME record**: `try` → `<app>.fly.dev` (simpler if your registrar
  supports CNAME on a subdomain)

After the DNS record propagates (usually 30 sec – 5 min), Fly
auto-issues a Let's Encrypt cert. Re-run `fly certs show
try.rednotebook.app` until status reads `Issued`. The demo is now
publicly reachable at `https://try.rednotebook.app`.

---

## Step 6 — Schedule a weekly wipe

The demo's job is to *demo*, not store data forever. Reset the volume
once a week so misuse can't compound and so visitors always land on
the fresh sample notebook.

Easiest: a tiny scheduled GitHub Actions workflow that hits an SSH
command on the Fly machine. Save as
`.github/workflows/demo-wipe.yml`:

```yaml
name: Wipe public demo

on:
  schedule:
    - cron: "0 4 * * 1"   # Mondays 04:00 UTC (= late Sun in US)
  workflow_dispatch:       # also let you trigger manually

jobs:
  wipe:
    runs-on: ubuntu-latest
    steps:
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: |
          flyctl ssh console \
            --app rednotebook-demo \
            --command "rm -rf /data/* /data/.* 2>/dev/null; touch /data/.empty"
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

You'll need a Fly API token in repo secrets:

```bash
fly tokens create deploy -x 999999h | head -1
```

Paste that into `Settings → Secrets → Actions → New repository secret →
FLY_API_TOKEN`.

After the wipe, the next visitor's `GET /api/notebooks` re-seeds the
samples automatically (see `rednotebook/notebook/seed.py`).

---

## Step 7 — Pin the deployed version to a release tag

For stable demos, swap `latest` for a fixed tag in `fly.toml`:

```toml
[build]
  image = "ghcr.io/sanniheruwala/rednotebook-ai:v0.7.20"
```

…then `fly deploy`. Update the tag whenever you cut a new release you
want the demo to track.

---

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Container won't start | `fly logs` — usually a port mismatch (`UVICORN_PORT` must equal `http_service.internal_port` in fly.toml). |
| App boots, demo banner missing | `DEMO_MODE` env var didn't make it to the runtime. `fly secrets list` will show what's actually set. |
| Sample notebook missing | First request to `/api/notebooks` triggers the seed. Hit `https://try.rednotebook.app/api/notebooks` directly, then refresh the UI. |
| Volume keeps filling up | The weekly wipe isn't running. Check the GH Actions logs. Manual wipe: `fly ssh console -a rednotebook-demo -C "rm -rf /data/*"`. |
| `fly certs show` stuck on `Awaiting` | DNS hasn't propagated yet. `dig try.rednotebook.app` should resolve to the Fly IP within a few minutes. |
| OOM on a real query | Bump `memory_mb` in fly.toml from 512 to 1024 and redeploy. |

---

## Costs (rough)

* **VM** scaled to zero when idle: $0 (you pay only when traffic
  hits).
* **VM at 512MB always-on**: ~$5.70/mo if you disable auto-stop.
* **Volume** at 1GB: $0.15/mo.
* **Cert + DNS**: free.

Realistic monthly cost for a sleepy demo with a few daily visitors and
`auto_stop_machines = "stop"`: **under $2**.

---

## Future improvements (out of scope for v1)

* **Per-IP rate limiting tighter than the default**. Today the API
  already uses `slowapi`; you can crank limits via env in
  `fly.toml`'s `[env]` section.
* **Sandboxed code execution** — not relevant today (SQL-only) but
  required if Python cells ever land.
* **Observability**: hook Fly metrics into Grafana Cloud (free tier).
* **Read-only mode** — current `auto_stop_machines = "stop"` is fine,
  but a stricter SQL guard for demo-only could prevent CREATE TABLE
  abuse.
