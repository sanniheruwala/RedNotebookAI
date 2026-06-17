"""Bundled AI provider — runs Qwen2.5-Coder-1.5B locally via llama.cpp.

Designed to be the *zero-config* default in the published Docker image
so users get a real AI flow on first launch without:

  - signing up for an external API,
  - installing Ollama,
  - editing settings.

Tradeoffs are deliberately honest:

  - Quality: a 1.5B coder model is good enough to write plausible SQL
    against the bundled sample notebook and to summarize result tables.
    On real warehouses it will hallucinate column names. We surface
    OpenAI / Anthropic / Ollama-with-bigger-model as the upgrade path.
  - Speed: ~30-50 tok/sec on a modern laptop CPU → ~3-5 s per SQL gen.
    On Apple Silicon Metal or a consumer GPU, ~instant.
  - Memory: Q4_K_M quant uses ~1.5 GB RAM.
  - First-call latency: model loads at *provider construction* time,
    not lazily, so a server boot pays the ~1-3 s mmap once and every
    request after is warm. If the import or load fails (no wheel for
    the platform, missing model file), the registry falls back to the
    mock provider with a WARNING — the AI surface degrades gracefully
    rather than crashing the app.
"""

from __future__ import annotations

import json
import logging
import os
import re
import threading
from pathlib import Path
from typing import Any

from rednotebook.ai.base import (
    AIContext,
    AIProvider,
    ChartSuggestion,
    DataFrameSchema,
    InfographicBrief,
    InfographicContext,
    ResultContext,
)
from rednotebook.ai.registry import register_provider

_log = logging.getLogger(__name__)


# Sensible defaults for a 1.5B coder model on commodity CPU. Tuned for
# response latency on shared-vCPU environments (HF Space free tier
# manages ~5-15 tok/sec). Settings biased toward "responds fast even
# if slightly less clever" rather than "polished but slow".
DEFAULT_CONTEXT_TOKENS = 2048  # was 4096 — half the prompt budget, twice the headroom for prompt eval speed
DEFAULT_MAX_OUTPUT_TOKENS = 220  # was 512 — caps every call at ~15-45s on slow CPUs
DEFAULT_TEMPERATURE = 0.0  # greedy decoding — deterministic + the fastest sampler
DEFAULT_TOP_P = 1.0

# Qwen 2.5 uses ChatML — the canonical template for the family. We set
# this explicitly rather than relying on llama-cpp-python's chat_format
# auto-detection from GGUF metadata, which has been unreliable across
# versions. The previous "qwen" string was either unregistered or aliased
# to an outdated template in newer llama-cpp-python releases, causing the
# model to skip the EOS token and run all the way to max_tokens — that
# was the "runs forever" symptom users hit on v0.7.26.
DEFAULT_CHAT_FORMAT = "chatml"

# ChatML's end-of-turn marker. Including this in `stop` is belt-and-
# suspenders alongside the model's own EOS token — protects against
# either getting suppressed by a quirk in the GGUF metadata.
CHATML_STOP_TOKENS: list[str] = ["<|im_end|>", "<|endoftext|>"]

# Bundled image bakes the model at this canonical path. Users can
# override via env so an air-gapped admin can drop a bigger GGUF in
# without rebuilding the image.
DEFAULT_MODEL_PATH = "/app/models/qwen2.5-coder-1.5b-instruct-q4_k_m.gguf"


_model_lock = threading.Lock()
_model_singleton: Any = None  # type: ignore[var-annotated]


def _resolve_model_path() -> Path | None:
    """Look for a GGUF model file in the canonical locations.

    Precedence:
      1. ``QWEN_MODEL_PATH`` / ``BUNDLED_MODEL_PATH`` env var.
      2. ``/app/models/`` (the Docker image location).
      3. ``./models/`` next to the working directory (dev fallback).
    """
    for env_key in ("QWEN_MODEL_PATH", "BUNDLED_MODEL_PATH"):
        raw = os.environ.get(env_key)
        if raw:
            p = Path(raw).expanduser()
            return p if p.exists() else None

    candidates = [
        Path(DEFAULT_MODEL_PATH),
        Path.cwd() / "models" / Path(DEFAULT_MODEL_PATH).name,
    ]
    for p in candidates:
        if p.exists():
            return p
    return None


def _load_model() -> Any:
    """Return a process-wide singleton ``llama_cpp.Llama`` instance.

    Loading the GGUF mmaps ~1 GB so we keep one instance and serialize
    inference behind ``_model_lock``. llama.cpp is single-threaded per
    instance — for a notebook-app workload (one user, one inference at
    a time) that's the right shape; a multi-tenant deploy that needs
    real concurrency should put an actual inference server in front
    (vLLM / TGI / hosted API).
    """
    global _model_singleton
    if _model_singleton is not None:
        return _model_singleton

    path = _resolve_model_path()
    if path is None:
        raise FileNotFoundError(
            "Bundled AI model file not found. Set QWEN_MODEL_PATH or place "
            f"a GGUF at {DEFAULT_MODEL_PATH}."
        )

    # Import inside the function so a missing wheel doesn't blow up at
    # module import — the registry try/except will catch a load failure
    # and fall back to mock.
    from llama_cpp import Llama

    cpu_threads = int(
        os.environ.get("BUNDLED_AI_THREADS") or max(2, (os.cpu_count() or 4) - 1)
    )
    _log.info(
        "Loading bundled AI model from %s (threads=%d, ctx=%d)",
        path,
        cpu_threads,
        DEFAULT_CONTEXT_TOKENS,
    )
    _model_singleton = Llama(
        model_path=str(path),
        n_ctx=DEFAULT_CONTEXT_TOKENS,
        n_threads=cpu_threads,
        n_batch=256,
        verbose=False,
        chat_format=DEFAULT_CHAT_FORMAT,
    )
    return _model_singleton


def _qualified_table(context: AIContext) -> str | None:
    parts = [p for p in (context.catalog, context.schema_name, context.table) if p]
    return ".".join(parts) if parts else None


def _format_schema(context: AIContext) -> str:
    """Render the table schema(s) as a compact text block for the prompt."""
    blocks: list[str] = []
    seen: set[str] = set()
    # The user's target table, if any.
    target = _qualified_table(context)
    if target and context.schemas:
        first = context.schemas[0]
        cols = first.get("columns", []) if isinstance(first, dict) else []
        col_lines = "\n".join(
            f"  - {c.get('name')} ({c.get('data_type', 'unknown')})"
            for c in cols
            if isinstance(c, dict)
        )
        blocks.append(f"Table {target}:\n{col_lines}")
        seen.add(target)

    for tbl in context.available_tables[:6]:
        name_parts = [tbl.catalog, tbl.schema_name, tbl.name]
        name = ".".join([p for p in name_parts if p])
        if name in seen:
            continue
        cols = tbl.columns or []
        col_lines = "\n".join(
            f"  - {c.get('name')} ({c.get('data_type', 'unknown')})"
            for c in cols
            if isinstance(c, dict)
        )
        blocks.append(f"Table {name}:\n{col_lines}")
        seen.add(name)
    return "\n\n".join(blocks) if blocks else "(no schema available)"


def _chat(
    system: str,
    user: str,
    history: list[dict[str, str]] | None = None,
    max_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
    stop: list[str] | None = None,
) -> str:
    """Run a single chat-completion call against the bundled model.

    Stop tokens always include ChatML's ``<|im_end|>`` in addition to
    anything the caller passes, so a misbehaving prompt can't make the
    model run to ``max_tokens`` and burn 30+ seconds of CPU.
    """
    model = _load_model()
    messages = [{"role": "system", "content": system}]
    if history:
        messages.extend(history)
    messages.append({"role": "user", "content": user})

    effective_stop = list(dict.fromkeys((stop or []) + CHATML_STOP_TOKENS))

    with _model_lock:
        result = model.create_chat_completion(
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=DEFAULT_TOP_P,
            stop=effective_stop,
        )
    try:
        return result["choices"][0]["message"]["content"].strip()
    except (KeyError, IndexError, TypeError):
        _log.warning("Bundled AI returned unexpected response: %r", result)
        return ""


def _extract_sql_block(text: str) -> str:
    """Pull the SQL out of a chat response.

    The model is *asked* to return only SQL but instruct-tuned LLMs love
    to wrap output in ```sql fences and prefix it with explanation. Be
    forgiving: if a fenced block exists, return its contents; otherwise
    return the full response with leading prose stripped where obvious.
    """
    fence = re.search(r"```(?:sql)?\s*(.+?)```", text, re.DOTALL | re.IGNORECASE)
    if fence:
        return fence.group(1).strip()
    # Strip leading "Sure, here's…" style preamble.
    cleaned = re.sub(r"^.*?(?=SELECT|WITH|INSERT|UPDATE|DELETE)", "", text, flags=re.IGNORECASE | re.DOTALL)
    return (cleaned or text).strip()


def _extract_json_block(text: str) -> dict[str, Any] | None:
    """Pull the first JSON object out of the response, or None."""
    fence = re.search(r"```(?:json)?\s*(\{.+?\})\s*```", text, re.DOTALL)
    if fence:
        try:
            return json.loads(fence.group(1))
        except json.JSONDecodeError:
            pass
    # Try to grab the first balanced {...} substring.
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except json.JSONDecodeError:
                    return None
    return None


class BundledAIProvider(AIProvider):
    """Local-inference AI provider over Qwen2.5-Coder-1.5B-Instruct."""

    name = "bundled"

    def __init__(self, settings: Any = None) -> None:
        self.settings = settings
        # Eager-load the model at construction so the first user-facing
        # request doesn't pay the mmap cost. If loading fails, raise so
        # the registry can fall back to mock with a clear log line.
        _load_model()

    # ------------------------------------------------------------------ SQL

    def generate_sql(self, prompt: str, context: AIContext) -> str:
        dialect = context.dialect or "ANSI SQL"
        schema_block = _format_schema(context)
        history = [
            {"role": turn.role, "content": turn.content}
            for turn in (context.history or [])
        ]
        system = (
            f"You are a careful {dialect} expert. You translate natural-language "
            "questions into SQL that only references the columns provided. Always "
            "return a SINGLE SQL statement inside a ```sql code fence. Add a LIMIT "
            "clause where appropriate so the query is safe to preview. Do NOT "
            "explain the query, do NOT add commentary — only the SQL."
        )
        user = (
            f"Available schema:\n{schema_block}\n\n"
            f"User question: {prompt.strip()}\n\n"
            "Return only the SQL."
        )
        raw = _chat(system, user, history=history, max_tokens=240, stop=["```\n\n"])
        return _extract_sql_block(raw) or "-- (bundled model returned no SQL)"

    def explain_sql(self, sql: str, context: AIContext) -> str:
        system = (
            "You are a concise SQL reviewer. Given a SQL query, explain what it "
            "does in 4-6 short bullet points. Focus on: what columns it returns, "
            "what filters apply, what joins (if any) happen, and any subtle "
            "behaviours. Use Markdown bullets. Don't restate the SQL."
        )
        user = f"```sql\n{sql.strip()}\n```"
        return _chat(system, user, max_tokens=200)

    def optimize_sql(self, sql: str, context: AIContext) -> str:
        # The frontend writes this response *directly back into the SQL
        # cell*, so the model MUST return parseable SQL with no prose,
        # no fences, no diff markers. The previous prompt asked for
        # fenced SQL + bullet explanation and the DuckDB parser choked
        # on the leading ```sql line (v0.7.27 bug).
        #
        # Small models often ignore "no markdown" instructions anyway,
        # so we also run the response through _extract_sql_block as a
        # defensive layer and fall back to the original SQL if the
        # model returned something we can't parse out — better to
        # silently keep the user's query than to overwrite their cell
        # with broken content.
        dialect = context.dialect or "ANSI SQL"
        system = (
            f"You are a senior {dialect} query optimizer. Rewrite the user's "
            "SQL so it runs faster and reads less data while producing the "
            "EXACT same rows (or document why a change is safe in a SQL "
            "comment). Apply predicate pushdown, prune SELECT *, eliminate "
            "redundant subqueries / ORDER BY / DISTINCT in inner scopes, "
            "prefer EXISTS over IN(subquery), and reorder joins so the "
            "smallest filtered relation is on the build side — whenever any "
            "of those are safe.\n\n"
            "Return ONLY the optimized SQL. No prose. No markdown fences. "
            "No diff. If no safe optimization applies, return the original "
            "SQL verbatim."
        )
        user = sql.strip()
        raw = _chat(system, user, max_tokens=300)
        extracted = _extract_sql_block(raw)
        if not extracted or not extracted.strip():
            return sql
        return extracted

    # ----------------------------------------------------------------- chart

    def suggest_chart(
        self,
        dataframe_schema: DataFrameSchema,
        sample: list[dict[str, Any]],
    ) -> ChartSuggestion:
        # The frontend already has a deterministic heuristic recommender
        # (frontend/lib/chart-recommender.ts) that handles this offline.
        # Defer to the same Python helper that mock uses so the AI flow
        # doesn't redundantly burn tokens on the easy case.
        from rednotebook.visualization.recommender import recommend_chart

        return recommend_chart(dataframe_schema, sample)

    # --------------------------------------------------------------- summary

    def summarize_result(self, context: ResultContext) -> str:
        cols = ", ".join(c["name"] for c in context.schema.columns[:8]) or "(no columns)"
        sample_text = ""
        if context.sample_rows:
            preview = context.sample_rows[:5]
            sample_text = "\nSample rows:\n" + "\n".join(
                json.dumps(row, default=str)[:200] for row in preview
            )
        system = (
            "You are a data analyst. Given a SQL query, its result schema, and "
            "a few sample rows, write a SHORT executive summary (4-6 bullets) "
            "of what the result shows. Lead with the headline number. Use "
            "Markdown. Don't restate column names — interpret what they mean."
        )
        user = (
            f"SQL:\n```sql\n{context.sql.strip()}\n```\n\n"
            f"Result has {context.schema.row_count} rows. Columns: {cols}."
            f"{sample_text}"
        )
        return _chat(system, user, max_tokens=180)

    # ----------------------------------------------------------- infographic

    def generate_infographic_brief(
        self,
        context: InfographicContext,
    ) -> InfographicBrief:
        schema = context.schema or DataFrameSchema()
        cols = ", ".join(c["name"] for c in schema.columns[:8]) or "(no columns)"
        system = (
            "You are a data storytelling assistant. Given a SQL result, return a "
            "JSON object with these keys: title (string), summary (string, one "
            'paragraph), insights (list of 3 short bullet strings), narrative '
            "(string, 2-3 sentences). Return ONLY the JSON inside a ```json fence."
        )
        user_parts = [
            f"Template hint: {context.template}",
            f"Title hint: {context.title_hint or '(none)'}",
            f"Columns: {cols}",
            f"Row count: {schema.row_count}",
        ]
        if context.sql:
            user_parts.append(f"SQL:\n```sql\n{context.sql.strip()}\n```")
        user = "\n\n".join(user_parts)
        raw = _chat(system, user, max_tokens=300)
        data = _extract_json_block(raw) or {}
        chart = self.suggest_chart(schema, context.sample_rows)
        return InfographicBrief(
            title=str(data.get("title") or context.title_hint or "Data Snapshot"),
            summary=str(data.get("summary") or "Generated by the bundled local model."),
            key_metrics=[{"label": "Rows", "value": schema.row_count}],
            insights=[str(x) for x in (data.get("insights") or []) if x][:5]
            or [
                "Result returned a non-empty dataset." if schema.row_count else "Result was empty.",
                f"Schema has {len(schema.columns)} columns.",
            ],
            recommended_charts=[chart],
            layout="stacked",
            narrative=str(data.get("narrative") or ""),
            caveats=[
                "Generated by the bundled local model (Qwen2.5-Coder-1.5B). "
                "For higher fidelity, configure OpenAI, Anthropic, or local Ollama "
                "in the admin AI settings.",
            ],
        )


register_provider("bundled", BundledAIProvider)
