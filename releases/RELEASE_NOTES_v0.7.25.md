# v0.7.25 — bundled local AI by default

The published Docker image now ships with **Qwen2.5-Coder-1.5B-Instruct**
baked in as the default AI provider. Bare `docker run` gets you real
SQL generation, summaries, and infographic narratives — no API key,
no Ollama install, no setup.

This is the change that lets us legitimately call the tool *AI-native*.

## What's bundled

| Component | Detail |
|---|---|
| Model | Qwen2.5-Coder-1.5B-Instruct, Q4_K_M quant (~1 GB on disk) |
| License | Apache 2.0 |
| Runtime | `llama-cpp-python` (CPU-only, ~50 MB wheel) |
| Image size impact | 600 MB → ~1.6 GB |
| RAM at runtime | ~1.5 GB resident while loaded |
| Speed | ~30-50 tok/sec CPU → 3-5 s per SQL gen. Apple Silicon Metal / GPU = ~instant |
| Cold start | ~2-3 s mmap at app boot, then every request is warm |

## Behaviour matrix

| Path | Default `AI_PROVIDER` | Model file location |
|---|---|---|
| Docker image | `bundled` (baked into ENV) | `/app/models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf` |
| `pip install rednotebook-ai` | `mock` (no model in wheel) | User points `QWEN_MODEL_PATH` at their own GGUF |
| HF Space (after bumping `FROM` tag) | `bundled` | Inherits from image |

## Quality + tradeoff framing

A 1.5B coder model writes *plausible* SQL on the bundled sample
notebook and clearly-degraded SQL on real warehouses. The admin AI
page now leads with the bundled option and explains the tradeoff in
plain English so users know when to graduate to OpenAI / Anthropic /
a bigger local model via Ollama.

## Graceful degradation

Two failure modes, both fall back to mock with a single WARNING log
line — never crash the AI surface:

1. **`llama_cpp` not installed**: the side-effect import in
   `server/main.py` catches it and bundled stays unregistered.
2. **GGUF file missing on disk**: `BundledAIProvider.__init__` raises
   `FileNotFoundError`; the registry's existing try/except in
   `get_provider` catches it.

Three new tests cover both paths.

## Upgrade

```bash
docker pull ghcr.io/sanniheruwala/rednotebook-ai:v0.7.25
```

HF Space refresh: bump the `FROM` tag in the Space's Dockerfile to
`:v0.7.25`. First HF rebuild will be slower than usual (~5-10 min
extra) because the model layer downloads 1 GB from HuggingFace. Every
subsequent app-only release reuses the cached model layer.

## Knobs

- `AI_PROVIDER=bundled|openai|anthropic|ollama|mock` — pick provider.
- `QWEN_MODEL_PATH=/path/to/your.gguf` — override the bundled GGUF
  (drop in Qwen 7B, Phi-3.5, etc.).
- `BUNDLED_AI_THREADS=4` — CPU thread count for inference. Defaults
  to `cpu_count - 1`.
