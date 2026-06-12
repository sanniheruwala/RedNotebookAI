# v0.7.18 — hotfix

Two infrastructure bugs from v0.7.17 fixed. **If you're running the
v0.7.16 image, upgrade — file uploads were broken there too.**

## Fixes

### 🐛 Docker image now actually builds

v0.7.17's release pipeline failed in the frontend build stage with:

> `Error relocating /app/frontend/node_modules/@next/swc-linux-arm64-gnu/next-swc.linux-arm64-gnu.node: __res_init: symbol not found`
> `⨯ Failed to load SWC binary for linux/arm64`

Next.js 14's SWC variant selector on Alpine arm64 was picking the
glibc (`-gnu`) prebuilt instead of the musl (`-musl`) one. The image
never published.

Fix: switched the frontend-build base from `node:20-alpine` to
`node:20-bookworm-slim` (Debian, glibc). Eliminates the variant
mismatch entirely. The final runtime image still uses
`python:3.12-slim`, so the published image size is unchanged.

### 🐛 File uploads & Publish failed in Docker with 500 "permission denied"

v0.7.16 shipped drag-drop file uploads + the Publish HTML share link,
both of which write under `local_data/{uploads,published}` by default.
The Dockerfile chowns `/data/<subdir>` for every storage directory but
those two new ones were missed. The non-root `redbook` user couldn't
write to the defaults under `/app/local_data/...`, so the upload
endpoint and the publish endpoint both returned 500.

Fix: Dockerfile now creates and chowns `/data/uploads` + `/data/published`,
and exports `UPLOADS_STORAGE_DIR=/data/uploads` +
`PUBLISHED_STORAGE_DIR=/data/published`. Both features now work in
the container.

## What's included from v0.7.17 (the failed-image release)

Since the v0.7.17 Docker image never published, this release also
ships the v0.7.17 change rolled-up:

* Dialect-aware SQL formatter button in every SQL cell's toolbar.

## Upgrade notes

* Existing volumes: nothing to migrate. The new `/data/uploads` and
  `/data/published` dirs are created lazily; they're empty for users
  who have never uploaded a file or published a notebook.
* PyPI wheel: rebuild on next `pip install -U rednotebook-ai`.
