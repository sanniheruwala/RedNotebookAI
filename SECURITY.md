# Security Policy

Thanks for helping keep RedNotebook AI safe.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Use one of these private channels instead:

- GitHub's [private vulnerability reporting](https://github.com/sanniheruwala/QueryCanvasAI/security/advisories/new) (preferred)
- Email: `sam.heruwala@gmail.com` with `[security] QueryCanvasAI` in the subject

Please include:

- A clear description of the vulnerability and its impact
- Reproduction steps (PoC code, curl commands, or a short video)
- Affected versions / commit SHAs
- Any suggested mitigation

We aim to:

- Acknowledge new reports within **3 business days**
- Triage and reach a fix plan within **14 days** for high-severity issues
- Coordinate a public disclosure date with the reporter

## Supported versions

RedNotebook AI is pre-1.0. Only the `main` branch receives security fixes.

| Version | Supported |
|---------|-----------|
| `main` (latest commit) | ✅ |
| Tagged pre-releases | ❌ — please upgrade |

## Scope

In scope:

- The Python backend (`rednotebook/`)
- The FastAPI HTTP layer (`rednotebook/server/`)
- The Next.js frontend (`frontend/`)
- The Trino connector and AI providers shipped in this repo
- The SQL guard, secret masking, and PII detection
- Docker image and `docker-compose.yml`

Out of scope (please file with upstream):

- Third-party AI providers (OpenAI, Anthropic, Ollama) themselves
- The Trino server you connect to
- The Google NotebookLM Enterprise APIs (we ship only a stub)
- Vulnerabilities that require a malicious operator with write access to the
  Trino cluster or the host filesystem

## Hardening defaults

We try to ship safe defaults:

- **Read-only by default.** Write SQL is blocked unless `ALLOW_WRITE_QUERIES=true`
  and the caller explicitly confirms.
- **No raw data to AI.** Sample rows are not sent to providers unless
  `AI_ALLOW_SAMPLE_ROWS=true`. PII / restricted columns are masked. Credentials
  are never forwarded.
- **No telemetry.** The app makes no outbound calls beyond the configured
  Trino and AI provider endpoints.

See [docs/security.md](docs/security.md) for the full model.

## Acknowledgements

We will credit reporters in release notes unless they ask to remain anonymous.
