# v0.7.27 — bundled AI hotfix (chatml + latency + banner copy)

Three bugs from the first real use of the bundled-Qwen image in
v0.7.26:

## 1. Summarize / explain / ask AI ran forever

`chat_format="qwen"` isn't stable across llama-cpp-python versions —
on 0.2.90+ it's either unregistered or aliased to a template that
doesn't match Qwen 2.5's actual ChatML format. Result: the model
never emits the EOS token, so generation runs all the way to
`max_tokens` at ~5-15 tok/sec on a shared CPU — 30-60 s per call,
felt like a hang.

Fixed by:

- `chat_format="chatml"` — Qwen 2.5's actual conversation template,
  stable in llama-cpp-python.
- Explicit stop tokens `<|im_end|>` + `<|endoftext|>` as belt-and-
  suspenders against a GGUF metadata quirk suppressing the EOS.
- Greedy decoding (`temperature=0.0`) — deterministic + slightly
  faster sampler.
- `n_ctx` halved (4096 → 2048) — prompt eval scales O(ctx²) and our
  prompts comfortably fit 2 k.
- Per-method `max_tokens` caps tightened across the board.

| Method | Before | After |
|---|---|---|
| summarize_result | 320 | 180 |
| explain_sql | 300 | 200 |
| optimize_sql | 420 | 260 |
| generate_sql | 400 | 240 |
| infographic_brief | 480 | 300 |

Worst-case wall clock on a 5 tok/sec shared CPU: now ~35-60 s per
call instead of ~60-100 s plus runaway.

## 2. "Failed to get API key" banner for bundled

The admin AI page banner literally said "check that the API key is
valid" when any non-mock provider fell back to mock. Wrong copy for
bundled, which has no API key concept.

Fixed by a new `fallbackHint(provider)` helper that returns provider-
specific guidance:

| Provider | Hint |
|---|---|
| `bundled` | verify the bundled GGUF model exists at `/app/models/` and that llama-cpp-python is installed |
| `ollama` | verify the Ollama server is reachable at `OLLAMA_BASE_URL` and the configured model is pulled |
| `openai` / `anthropic` | verify the API key is valid and the configured model is correct |

The registry's WARNING log line was also updated to drop the
misleading "Check API key + bundled SDK install" tail and list the
actual first-line failure mode per provider.

## 3. Pydantic schema-shadow warnings

`UserWarning: Field name "schema" in "ResultContext" / "InfographicContext"
shadows an attribute in parent "BaseModel"` fired on every server start.
Silenced at the model level with `ConfigDict(protected_namespaces=())`.

## Upgrade

```bash
docker pull ghcr.io/sanniheruwala/rednotebook-ai:v0.7.27
```

HF Space: bump the `FROM` tag in the Space's Dockerfile from
`:v0.7.26` to `:v0.7.27`.
