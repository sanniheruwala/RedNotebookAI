# syntax=docker/dockerfile:1.7

# ---------- Stage 1: build the Next.js static export ----------
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund

COPY frontend/ ./
ENV NEXT_OUTPUT=export \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

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

# ---------- Stage 3: runtime ----------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    UVICORN_HOST=0.0.0.0 \
    UVICORN_PORT=8000

WORKDIR /app

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

# Create the per-user data dirs and a non-root user
RUN useradd -m -u 1000 redbook \
    && mkdir -p /data/notebooks /data/knowledge /data/auth /data/artifacts /data/exports \
    && chown -R redbook:redbook /data
ENV NOTEBOOK_STORAGE_DIR=/data/notebooks \
    KNOWLEDGE_STORAGE_DIR=/data/knowledge \
    AUTH_STORAGE_DIR=/data/auth \
    ARTIFACTS_DIR=/data/artifacts \
    EXPORTS_DIR=/data/exports

USER redbook

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).status==200 else 1)" || exit 1

CMD ["uvicorn", "rednotebook.server.main:app", "--host", "0.0.0.0", "--port", "8000"]
