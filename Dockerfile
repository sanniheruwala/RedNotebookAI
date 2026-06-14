# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the Next.js static export ----------
#
# Debian-based (glibc), NOT Alpine. Next.js 14's SWC variant selector on
# Alpine arm64 sometimes picks the *-gnu prebuilt instead of the *-musl
# one, then dies on `__res_init: symbol not found` because Alpine ships
# musl. That bit us in the v0.7.17 release build. Switching to
# `node:20-bookworm-slim` eliminates the variant-detection problem
# entirely — the final runtime image still uses python:3.12-slim, so
# this doesn't change the final image size.
FROM node:20-bookworm-slim AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY frontend/ ./
ENV NEXT_OUTPUT=export \
    NEXT_TELEMETRY_DISABLED=1
# next/font/google fetches Inter + JetBrains Mono from fonts.googleapis.com
# at build time, and that can intermittently fail behind CI egress. Retry
# the build a few times so a single transient blip doesn't sink the image.
RUN for attempt in 1 2 3 4 5; do \
        echo "frontend build attempt $attempt"; \
        npm run build && break || { \
            if [ "$attempt" = "5" ]; then exit 1; fi; \
            echo "retrying in 5s..."; sleep 5; \
        }; \
    done

# ---------- Stage 2: build the Python wheel ----------
FROM python:3.12-slim AS python-build
WORKDIR /build

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY rednotebook ./rednotebook
RUN pip install --upgrade pip build \
    && python -m build --wheel --outdir /wheels

# ---------- Stage 2b: fetch the bundled GGUF model ----------
#
# Pulled in a dedicated stage so the model layer is cached separately
# from the application layer — bumping the app version doesn't force
# a re-download of the 1 GB model. We retry up to 5 times because
# HuggingFace's CDN occasionally times out mid-stream behind CI egress.
#
# Model: Qwen2.5-Coder-1.5B-Instruct, Q4_K_M quant (~ 1.0 GB on disk,
# ~ 1.5 GB resident). Apache 2.0 licensed. The bundled provider
# (rednotebook/ai/bundled_provider.py) mmaps this at boot.
FROM debian:bookworm-slim AS model-fetch
WORKDIR /models

ARG QWEN_MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf?download=true"
ARG QWEN_MODEL_FILE="qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"
ARG QWEN_MODEL_MIN_BYTES=900000000

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && for attempt in 1 2 3 4 5; do \
        echo "GGUF download attempt $attempt"; \
        curl -fL --retry 0 --connect-timeout 20 --max-time 1800 \
            -o "/models/${QWEN_MODEL_FILE}" "${QWEN_MODEL_URL}" \
            && SIZE=$(stat -c%s "/models/${QWEN_MODEL_FILE}") \
            && [ "$SIZE" -ge "$QWEN_MODEL_MIN_BYTES" ] \
            && break \
            || { \
                if [ "$attempt" = "5" ]; then \
                    echo "GGUF download failed after 5 attempts" >&2; \
                    exit 1; \
                fi; \
                rm -f "/models/${QWEN_MODEL_FILE}"; \
                echo "retrying in 10s..."; sleep 10; \
            }; \
    done \
    && ls -lh "/models/${QWEN_MODEL_FILE}"

# ---------- Stage 3: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=8000

WORKDIR /app

# System libraries the bundled DB drivers load at connect time:
#   - unixodbc:    runtime library the pyodbc wheel dlopens (no-op for the
#                  Python import, but required as soon as a MSSQL connection
#                  opens).
#   - msodbcsql18: Microsoft's ODBC driver that pyodbc actually talks to
#                  when connecting to SQL Server / Azure SQL.
# Microsoft's apt repo serves amd64 + arm64, which matches the multi-arch
# build matrix in .github/workflows/release.yml.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl gnupg apt-transport-https \
    && curl -fsSL https://packages.microsoft.com/keys/microsoft.asc \
        | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg \
    && echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" \
        > /etc/apt/sources.list.d/mssql-release.list \
    && apt-get update \
    && ACCEPT_EULA=Y apt-get install -y --no-install-recommends \
        unixodbc msodbcsql18 \
    && apt-get purge -y --auto-remove curl gnupg apt-transport-https \
    && rm -rf /var/lib/apt/lists/*

# Install the application + runtime deps from the prebuilt wheel
COPY --from=python-build /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl \
    && rm -rf /wheels

# Drop the built frontend export inside the package directory so the FastAPI
# server can find it via the static-mount logic in server.main.
RUN python - <<'PY'
import os, sys
import rednotebook
print(os.path.dirname(rednotebook.__file__))
PY

COPY --from=frontend-build /app/frontend/out /static_frontend
ENV REDNOTEBOOK_STATIC_DIR=/static_frontend

# Create the per-user data dirs and a non-root user. /data/uploads +
# /data/published were added in v0.7.18 to cover the drag-drop file
# upload + public publish features — without these the non-root user
# can't write to the default `local_data/{uploads,published}` paths
# under /app and uploads / publishes fail with 500 "permission denied".
RUN useradd -m -u 1000 redbook \
    && mkdir -p /data/notebooks /data/knowledge /data/auth /data/artifacts /data/exports \
                /data/connections /data/audit /data/admin \
                /data/uploads /data/published \
    && chown -R redbook:redbook /data
ENV NOTEBOOK_STORAGE_DIR=/data/notebooks \
    KNOWLEDGE_STORAGE_DIR=/data/knowledge \
    AUTH_STORAGE_DIR=/data/auth \
    ARTIFACTS_DIR=/data/artifacts \
    EXPORTS_DIR=/data/exports \
    CONNECTION_STORAGE_DIR=/data/connections \
    AUDIT_STORAGE_DIR=/data/audit \
    RUNTIME_CONFIG_DIR=/data/admin \
    UPLOADS_STORAGE_DIR=/data/uploads \
    PUBLISHED_STORAGE_DIR=/data/published

# Drop the bundled GGUF in /app/models — read-only is fine, the
# provider mmaps it. The default AI_PROVIDER for the published image is
# `bundled` so the demo flow works on a bare `docker run`. Override
# with `-e AI_PROVIDER=openai -e OPENAI_API_KEY=...` to skip the local
# model and run zero-RAM-overhead with a hosted provider.
COPY --from=model-fetch --chown=redbook:redbook /models /app/models
ENV AI_PROVIDER=bundled \
    QWEN_MODEL_PATH=/app/models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf

USER redbook

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status==200 else 1)" || exit 1

CMD ["uvicorn", "rednotebook.server.main:app", "--host", "0.0.0.0", "--port", "8000"]
