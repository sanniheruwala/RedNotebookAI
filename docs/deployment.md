# Deployment Guide

RedNotebook AI is **local-first**. It runs great on a laptop and is suitable
for self-hosting in trusted environments. It is **not** ready to expose on
the public internet yet — see the tiers below for what's safe today.

## Three deployment tiers

| Tier | Audience | Network | Status | Recommended? |
|------|----------|---------|--------|--------------|
| 1. Local laptop | Just you | `localhost` only | ✅ **Supported** | Yes — this is the primary use case |
| 2. Single team, behind VPN / private network | A trusted team | LAN / VPN / private k8s | ✅ **Supported with caveats** | Yes, with the hardening checklist below |
| 3. Public internet, multi-user SaaS | The whole world | Public TCP/443 | ❌ **NOT supported** | No — wait for Phase 4 |

---

## Tier 1 — Local laptop

The intended primary use case. Run the backend and frontend on your machine
and use them from `http://localhost:3000`.

```bash
# backend
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env  # fill in TRINO_* and any AI_* keys you want
rednotebook run        # FastAPI on :8000

# frontend (separate terminal)
cd frontend && npm install && npm run dev   # Next.js on :3000
```

**What's safe at this tier:**

- Connection credentials live in your browser's `localStorage` — they never
  leave your machine.
- AI provider keys live in your local `.env` — they go from your machine to
  the AI provider directly.
- Notebooks and the knowledge layer persist to `local_data/` on your disk.

**What to still avoid:**

- Don't paste secrets or PII into AI prompts unless `AI_MASK_PII=true` and
  `AI_ALLOW_SAMPLE_ROWS` is what you want.
- Don't run with `ALLOW_WRITE_QUERIES=true` unless you genuinely need writes
  and understand the SQL guard.

---

## Tier 2 — Single team behind a VPN / private network

Acceptable for a small, trusted team that shares one instance behind a
private network (LAN, corporate VPN, Tailscale, private k8s cluster, etc).

The model is still **single-tenant**: there's no per-user login or notebook
ownership — everyone with network access sees the same notebooks and
connections. Think of it like sharing one Jupyter server.

### Hardening checklist before going live

- [ ] Run behind a **VPN or private network only** — never bind `0.0.0.0`
      on a public IP.
- [ ] Put both services behind a **reverse proxy with TLS** (nginx, Caddy,
      Traefik). Don't expose plain HTTP.
- [ ] Add **HTTP basic auth or an SSO proxy** (e.g. `oauth2-proxy`,
      Cloudflare Access) in front of the reverse proxy as a defense-in-depth
      authentication layer.
- [ ] Run as a **non-root user** inside the container. The shipped Dockerfile
      already does this implicitly via `python:3.11-slim`, but verify.
- [ ] Restrict the Trino service account RedNotebook uses to **read-only**.
      Set `ALLOW_WRITE_QUERIES=false` (the default) — never override.
- [ ] **Rotate AI provider keys** if anyone leaves the team.
- [ ] Mount `local_data/` on a backed-up volume — that's where notebooks +
      knowledge sources live.
- [ ] Keep `AI_ALLOW_SAMPLE_ROWS=false` and `AI_MASK_PII=true` unless every
      user is cleared to share raw rows with the chosen AI provider.

### Example: docker-compose with reverse proxy + basic auth

```yaml
services:
  rednotebook:
    image: rednotebook-ai:latest
    env_file: .env
    expose: ["8000"]
    volumes:
      - rednotebook-data:/app/local_data

  caddy:
    image: caddy:2
    ports:
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data
    depends_on: [rednotebook]

volumes:
  rednotebook-data:
  caddy-data:
```

```caddy
rednotebook.internal {
    basicauth {
        team JDJhJDE0JC4uLg==  # bcrypt hash, use `caddy hash-password`
    }
    reverse_proxy rednotebook:8000
}
```

---

## Tier 3 — Public internet (NOT supported yet)

**Do not expose RedNotebook AI on the public internet today.** The gaps:

- No authentication or user model — anyone with the URL gets full access.
- No per-user namespacing — notebooks, knowledge, and connection state are
  global. One user editing a notebook overwrites everyone else's view of it.
- Connection credentials live in browser localStorage — fine when "the
  browser" is your laptop, problematic when you're inviting strangers.
- No rate limiting — the AI and query endpoints can be abused for
  cost-amplification attacks against your AI provider account.
- No audit logging — you can't tell who ran what.

The Phase 4 roadmap covers all of this:

- Authentication (NextAuth / OIDC / SSO)
- Per-user notebook + knowledge namespacing
- Server-side encrypted connection store
- Rate limiting on AI and query endpoints
- Audit log of queries + AI calls
- Workspace / team model with sharing

Watch [docs/roadmap.md](roadmap.md) for progress.

---

## Securing the AI provider

Even at Tier 1, treat AI provider keys as production credentials:

- **OpenAI / Anthropic:** create a key scoped only to RedNotebook. Set a
  monthly spend cap. Rotate quarterly.
- **Ollama:** the local model runs entirely on your machine — no key needed.
  Prefer this when working with sensitive data.

The AI context builder defaults to **schema + aggregated stats only**, with
PII masking. Sample rows are never sent unless `AI_ALLOW_SAMPLE_ROWS=true`.

---

## Backing up your data

Everything you create lives in:

```
local_data/
├── notebooks/         # SQL notebooks (JSON)
└── knowledge/         # Knowledge notebooks + sources (JSON)
artifacts/             # Optional Parquet result cache
exports/               # Generated infographics + exports
```

For Tier 2, mount these on a persistent volume with a periodic snapshot.
For Tier 1, your usual machine backup is enough.
