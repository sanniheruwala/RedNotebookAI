"""Render a Notebook + per-cell result snapshots to self-contained HTML.

The output is a single HTML document with all CSS inlined and no JS — safe
to drop on a CDN, GitHub Pages, or a plain web server. Renderer goals:

  * Look as close to the live notebook as practical (dark theme with
    accent green to match the brand).
  * Be small. A 30-cell notebook with five 100-row result tables should
    weigh < 200 KB without external assets.
  * Never depend on JS or fonts that need to be fetched at view time.

Markdown is rendered via ``markdown_it``. SQL is shown as a styled code
block with a tiny keyword-aware highlighter — we deliberately don't pull
Pygments to keep the dep footprint flat.
"""

from __future__ import annotations

import html
import json
from datetime import datetime
from typing import Any

from rednotebook.notebook.models import (
    AIPromptCell,
    KnowledgeNoteCell,
    MarkdownCell,
    Notebook,
    SQLCell,
    VisualizationCell,
)

# Mirrors the live app's primary green + zinc-ish dark surface. Inlined
# (no Tailwind) so the file is portable.
_CSS = """
:root {
  color-scheme: dark;
  --bg: #0a0a0a;
  --surface: #161616;
  --surface-2: #1f1f1f;
  --border: #2a2a2a;
  --muted: #94a3b8;
  --text: #e5e7eb;
  --primary: #22c55e;
  --primary-soft: rgba(34, 197, 94, 0.12);
  --danger: #ef4444;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--text); }
body {
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, "Inter", "Segoe UI",
        sans-serif;
  padding: 40px 24px 80px;
}
main { max-width: 980px; margin: 0 auto; }
header.nb-header {
  display: flex; align-items: baseline; gap: 12px;
  padding-bottom: 14px; margin-bottom: 22px;
  border-bottom: 1px solid var(--border);
}
header.nb-header h1 {
  font-size: 28px; line-height: 1.2; margin: 0;
  letter-spacing: -0.01em; font-weight: 600;
}
header.nb-header .meta {
  font-size: 12px; color: var(--muted); margin-left: auto;
}
.cell {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 14px; padding: 18px 20px; margin-bottom: 14px;
}
.cell.markdown { background: transparent; border: none; padding: 0 4px; }
.cell .label {
  display: inline-flex; gap: 6px; align-items: center;
  font-size: 10px; font-weight: 600; letter-spacing: 0.18em;
  text-transform: uppercase; color: var(--primary);
  margin-bottom: 10px;
}
.cell .label::before {
  content: ""; display: inline-block; width: 6px; height: 6px;
  border-radius: 999px; background: var(--primary);
}
.cell pre.sql {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 10px; padding: 12px 14px; margin: 0 0 12px;
  font: 13px/1.5 ui-monospace, "JetBrains Mono", "SF Mono", monospace;
  overflow-x: auto; color: var(--text);
}
.cell pre.sql .kw  { color: #c084fc; }
.cell pre.sql .fn  { color: #60a5fa; }
.cell pre.sql .str { color: #fbbf24; }
.cell pre.sql .num { color: #fca5a5; }
.cell pre.sql .com { color: #6b7280; font-style: italic; }
table.result {
  width: 100%; border-collapse: collapse; font-size: 13px;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 10px; overflow: hidden;
}
table.result th, table.result td {
  padding: 8px 12px; text-align: left;
  border-bottom: 1px solid var(--border);
}
table.result th {
  background: rgba(34, 197, 94, 0.06);
  font-weight: 600; color: var(--text); white-space: nowrap;
}
table.result tr:last-child td { border-bottom: none; }
table.result td.num { text-align: right; font-variant-numeric: tabular-nums; }
table.result td.null { color: var(--muted); font-style: italic; opacity: 0.6; }
.result-meta {
  font-size: 11px; color: var(--muted); margin-top: 8px;
}
.cell.ai .prompt {
  font: 13px/1.55 inherit; color: var(--text);
  background: var(--surface-2); border-radius: 10px;
  padding: 10px 12px; border-left: 3px solid var(--primary);
}
.cell.ai .response { margin-top: 10px; }
.markdown-body { color: var(--text); }
.markdown-body h1, .markdown-body h2, .markdown-body h3 {
  letter-spacing: -0.01em; margin: 16px 0 8px;
}
.markdown-body h1 { font-size: 22px; }
.markdown-body h2 { font-size: 18px; }
.markdown-body h3 { font-size: 15px; }
.markdown-body p { margin: 8px 0; }
.markdown-body code {
  background: var(--surface-2); padding: 1px 5px;
  border-radius: 4px; font-size: 12.5px;
}
.markdown-body pre {
  background: var(--surface-2); padding: 12px;
  border-radius: 10px; overflow-x: auto; font-size: 13px;
}
.markdown-body ul, .markdown-body ol { padding-left: 20px; }
.markdown-body li { margin: 4px 0; }
.markdown-body blockquote {
  border-left: 3px solid var(--primary); margin: 0;
  padding: 4px 0 4px 12px; color: var(--muted);
}
.markdown-body strong { color: var(--text); }
footer.brand {
  margin-top: 48px; padding-top: 18px;
  border-top: 1px solid var(--border);
  font-size: 12px; color: var(--muted); text-align: center;
}
footer.brand a { color: var(--primary); text-decoration: none; }
footer.brand a:hover { text-decoration: underline; }
"""

_SQL_KEYWORDS = frozenset(
    """
    select from where group by order having limit offset as distinct on
    join inner outer left right full cross lateral union intersect except
    with recursive case when then else end and or not in is null true false
    between like ilike similar to escape exists any all over partition rows
    range preceding following unbounded current row asc desc nulls first last
    create or replace view table temporary temp if not drop alter add column
    primary key foreign references unique check default index using insert
    into values update set delete from explain analyze
    """.split()
)


def _highlight_sql(sql: str) -> str:
    """Tiny dependency-free SQL syntax highlighter.

    Wraps keywords, function calls, string literals, numbers, and SQL
    comments in span classes the inline stylesheet then colours. Good
    enough for "this is clearly SQL" without pulling in Pygments.
    """

    def encode(s: str) -> str:
        return html.escape(s, quote=False)

    out: list[str] = []
    i = 0
    n = len(sql)
    while i < n:
        ch = sql[i]
        # Single-line comment
        if ch == "-" and i + 1 < n and sql[i + 1] == "-":
            j = sql.find("\n", i)
            j = n if j == -1 else j
            out.append(f'<span class="com">{encode(sql[i:j])}</span>')
            i = j
            continue
        # String literal (single quote, doubled-quote escape)
        if ch == "'":
            j = i + 1
            while j < n:
                if sql[j] == "'" and (j + 1 >= n or sql[j + 1] != "'"):
                    j += 1
                    break
                if sql[j] == "'":  # doubled, skip both
                    j += 2
                    continue
                j += 1
            out.append(f'<span class="str">{encode(sql[i:j])}</span>')
            i = j
            continue
        # Number
        if ch.isdigit():
            j = i
            while j < n and (sql[j].isdigit() or sql[j] == "."):
                j += 1
            out.append(f'<span class="num">{encode(sql[i:j])}</span>')
            i = j
            continue
        # Word — match longest identifier-ish run
        if ch.isalpha() or ch == "_":
            j = i
            while j < n and (sql[j].isalnum() or sql[j] == "_"):
                j += 1
            word = sql[i:j]
            lo = word.lower()
            # Function call if followed by '(' (skipping whitespace).
            k = j
            while k < n and sql[k] in " \t":
                k += 1
            if lo in _SQL_KEYWORDS:
                out.append(f'<span class="kw">{encode(word)}</span>')
            elif k < n and sql[k] == "(":
                out.append(f'<span class="fn">{encode(word)}</span>')
            else:
                out.append(encode(word))
            i = j
            continue
        out.append(encode(ch))
        i += 1
    return "".join(out)


def _render_markdown(source: str) -> str:
    """Render markdown via markdown-it (already a transitive dep)."""
    try:
        from markdown_it import MarkdownIt  # type: ignore[import-not-found]
    except ImportError:  # pragma: no cover — markdown_it is a transitive dep
        return f"<pre>{html.escape(source)}</pre>"
    md = MarkdownIt("commonmark", {"linkify": True, "typographer": True}).enable(
        ["table", "strikethrough"]
    )
    return md.render(source)


def _render_result_table(snapshot: dict[str, Any] | None) -> str:
    if not snapshot:
        return ""
    columns = snapshot.get("columns") or []
    rows = snapshot.get("rows") or []
    if not columns:
        return ""
    # Cap rows so a 10k-row preview doesn't blow up the static file.
    cap = 200
    truncated = len(rows) > cap
    visible = rows[:cap]

    def cell(value: Any) -> str:
        if value is None:
            return '<td class="null">null</td>'
        if isinstance(value, bool):
            return f"<td>{value}</td>"
        if isinstance(value, (int, float)):
            return f'<td class="num">{html.escape(str(value))}</td>'
        return f"<td>{html.escape(str(value))}</td>"

    head = "".join(
        f"<th>{html.escape(str(c.get('name', '')))}</th>" for c in columns
    )
    body_rows = []
    col_names = [c.get("name", "") for c in columns]
    for r in visible:
        body_rows.append("<tr>" + "".join(cell(r.get(n)) for n in col_names) + "</tr>")
    row_count = snapshot.get("row_count", len(rows))
    duration = snapshot.get("duration_seconds")
    meta_bits = [f"{row_count:,} rows"]
    if duration is not None:
        meta_bits.append(f"{duration * 1000:.0f} ms")
    if truncated:
        meta_bits.append(f"showing first {cap}")
    return (
        f'<table class="result"><thead><tr>{head}</tr></thead>'
        f'<tbody>{"".join(body_rows)}</tbody></table>'
        f'<div class="result-meta">{" · ".join(meta_bits)}</div>'
    )


def render_notebook_html(
    notebook: Notebook,
    *,
    results: dict[str, dict[str, Any]] | None = None,
    published_at: datetime | None = None,
    author: str | None = None,
) -> str:
    """Build a self-contained HTML page for ``notebook``.

    ``results`` is a ``cell_id → snapshot`` mapping where each snapshot has
    the same shape as :class:`QueryResultPayload` (columns / rows /
    row_count / duration_seconds). Snapshots come from the live frontend
    so the published page captures the result state the publisher saw —
    not whatever the live source returns at view time.
    """
    results = results or {}
    title = notebook.metadata.title or "Untitled notebook"
    description = notebook.metadata.description or ""

    parts: list[str] = []
    for cell in notebook.cells:
        if isinstance(cell, MarkdownCell):
            parts.append(
                f'<section class="cell markdown">'
                f'<div class="markdown-body">{_render_markdown(cell.source)}</div>'
                f"</section>"
            )
        elif isinstance(cell, SQLCell):
            sql_html = _highlight_sql(cell.sql.strip() or "-- empty cell")
            table_html = _render_result_table(results.get(cell.id))
            parts.append(
                f'<section class="cell sql">'
                f'<div class="label">SQL</div>'
                f"<pre class=\"sql\">{sql_html}</pre>"
                f"{table_html}"
                f"</section>"
            )
        elif isinstance(cell, AIPromptCell):
            prompt_html = html.escape(cell.prompt or "").replace("\n", "<br>")
            response_html = (
                f'<div class="response markdown-body">'
                f"{_render_markdown(cell.response)}</div>"
                if cell.response
                else ""
            )
            parts.append(
                f'<section class="cell ai">'
                f'<div class="label">Ask AI</div>'
                f'<div class="prompt">{prompt_html}</div>'
                f"{response_html}"
                f"</section>"
            )
        elif isinstance(cell, VisualizationCell):
            cfg = cell.chart_config.model_dump() if cell.chart_config else {}
            parts.append(
                f'<section class="cell chart">'
                f'<div class="label">Chart</div>'
                f'<pre class="sql">{html.escape(json.dumps(cfg, indent=2))}</pre>'
                f'<div class="result-meta">Live chart rendering is omitted '
                f"in the static page.</div></section>"
            )
        elif isinstance(cell, KnowledgeNoteCell):
            body = _render_markdown(cell.body or "")
            parts.append(
                f'<section class="cell markdown">'
                f'<div class="markdown-body"><h3>{html.escape(cell.title or "Note")}</h3>'
                f"{body}</div></section>"
            )
        else:  # pragma: no cover — exhaustive above
            continue

    cells_html = "\n".join(parts)
    when = (published_at or datetime.utcnow()).strftime("%Y-%m-%d %H:%M UTC")
    by = f" · by {html.escape(author)}" if author else ""

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{html.escape(title)} — RedNotebook AI</title>
  <meta name="description" content="{html.escape(description[:160])}">
  <meta name="robots" content="noindex">
  <style>{_CSS}</style>
</head>
<body>
  <main>
    <header class="nb-header">
      <h1>{html.escape(title)}</h1>
      <span class="meta">{when}{by}</span>
    </header>
    {cells_html}
    <footer class="brand">
      Made with
      <a href="https://github.com/sanniheruwala/RedNotebookAI"
         target="_blank" rel="noopener">RedNotebook AI</a>
      — open-source AI data notebook.
    </footer>
  </main>
</body>
</html>
"""
