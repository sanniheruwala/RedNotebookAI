# v0.7.26 — fix the v0.7.25 image build

v0.7.25 was tagged but never produced a Docker image — the build
failed in both amd64 and arm64 runtime stages with:

```
ERROR: Failed to build installable wheels for some pyproject.toml
based projects (llama-cpp-python)
```

## Root cause

`llama-cpp-python` upstream doesn't publish a complete wheel matrix
to PyPI. They publish prebuilt CPU-only wheels to a dedicated index
at <https://abetlen.github.io/llama-cpp-python/whl/cpu> covering
every supported Python × `linux_{x86_64,aarch64}` combination.

pip in the `python:3.12-slim` runtime stage couldn't find a matching
manylinux wheel on PyPI and fell through to a **source build**,
which dies because slim images have no compiler / cmake / make.

## The fix

One-line change in the runtime stage:

```diff
 COPY --from=python-build /wheels /wheels
-RUN pip install --no-cache-dir /wheels/*.whl \
+RUN pip install --no-cache-dir \
+        --extra-index-url https://abetlen.github.io/llama-cpp-python/whl/cpu \
+        /wheels/*.whl \
     && rm -rf /wheels
```

PyPI stays the **primary** index. The CPU wheel index is consulted
secondarily for packages PyPI doesn't fully cover — pip can only
pull `llama-cpp-python` from there because nothing else lives in
that index.

## v0.7.25 status

The v0.7.25 GitHub Release page exists for documentation purposes,
but **no `:v0.7.25` Docker image was ever published**. Use `:v0.7.26`
as the first release with the bundled-Qwen feature actually built.

## Upgrade

```bash
docker pull ghcr.io/sanniheruwala/rednotebook-ai:v0.7.26
```

HF Space: bump the `FROM` tag in the Space's Dockerfile from
`:v0.7.24` (the previous shipping release) directly to `:v0.7.26`.
Skip `:v0.7.25` — it doesn't exist.
