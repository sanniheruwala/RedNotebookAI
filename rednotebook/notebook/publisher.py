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
table.result td.num, table.result th.num { text-align: right; font-variant-numeric: tabular-nums; }
table.result td.null { color: var(--muted); font-style: italic; opacity: 0.6; }
table.result td.bool { color: #c084fc; font-variant-numeric: tabular-nums; }
table.result td.trunc span { cursor: help; border-bottom: 1px dotted var(--muted); }
table.result th .type-hint {
  display: block; margin-top: 1px;
  font-size: 10px; font-weight: 400;
  color: var(--muted); letter-spacing: 0.06em;
  text-transform: lowercase;
}
.result-meta {
  font-size: 11px; color: var(--muted); margin-top: 8px;
}
.chart-card {
  margin: 4px 0 14px;
  padding: 6px 0 0;
}
.chart-card .plotly-graph-div { min-height: 360px; }
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


def _fmt_value(value: Any) -> tuple[str, str]:
    """Return (html-safe text, css class) for one table cell.

    The class lets the inline stylesheet right-align numerics + style nulls.
    Long strings get truncated with a tooltip carrying the full value so a
    1 KB JSON blob doesn't blow out the column width.
    """
    if value is None:
        return "null", "null"
    if isinstance(value, bool):
        return ("true" if value else "false"), "bool"
    if isinstance(value, int):
        return f"{value:,}", "num"
    if isinstance(value, float):
        # Locale-aware thousands separator + sane decimal precision.
        if value.is_integer():
            return f"{int(value):,}", "num"
        return f"{value:,.4f}".rstrip("0").rstrip("."), "num"
    s = str(value)
    if len(s) > 80:
        short = s[:77] + "…"
        return (
            f'<span title="{html.escape(s, quote=True)}">{html.escape(short)}</span>',
            "trunc",
        )
    return html.escape(s), ""


def _column_is_numeric(rows: list[dict[str, Any]], name: str) -> bool:
    """Right-align a column if at least 70% of its present values are numeric."""
    seen = 0
    nums = 0
    for r in rows:
        v = r.get(name)
        if v is None:
            continue
        seen += 1
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            nums += 1
    if seen == 0:
        return False
    return nums / seen >= 0.7


def _render_result_table(snapshot: dict[str, Any] | None) -> str:
    """Render a result snapshot as a compact, premium-looking HTML table.

    - 50-row cap (down from 200) — a static share isn't a data dump.
    - Numbers get locale-aware thousands separators + right alignment when
      the column is mostly numeric.
    - Long strings truncate at 80 chars with a ``title`` attribute carrying
      the original value.
    - Cells with no result render nothing (we don't want empty tables
      cluttering the published page).
    """
    if not snapshot:
        return ""
    columns = snapshot.get("columns") or []
    rows = snapshot.get("rows") or []
    if not columns or not rows:
        return ""

    cap = 50
    truncated = len(rows) > cap
    visible = rows[:cap]
    col_names = [c.get("name", "") for c in columns]
    numeric_cols = {n for n in col_names if _column_is_numeric(rows, n)}

    def cell(value: Any, col_name: str) -> str:
        text, cls = _fmt_value(value)
        # Numeric columns get right-aligned even when an individual cell
        # is null — keeps the column visually coherent.
        if col_name in numeric_cols and not cls:
            cls = "num"
        return f'<td class="{cls}">{text}</td>' if cls else f"<td>{text}</td>"

    head_cells = []
    for c in columns:
        n = str(c.get("name", ""))
        dtype = str(c.get("data_type", "")).strip()
        align_cls = " class=\"num\"" if n in numeric_cols else ""
        type_hint = (
            f'<span class="type-hint">{html.escape(dtype.lower())}</span>'
            if dtype
            else ""
        )
        head_cells.append(f"<th{align_cls}>{html.escape(n)}{type_hint}</th>")
    head = "".join(head_cells)

    body_rows = [
        "<tr>" + "".join(cell(r.get(n), n) for n in col_names) + "</tr>"
        for r in visible
    ]

    row_count = snapshot.get("row_count", len(rows))
    duration = snapshot.get("duration_seconds")
    meta_bits = [f"{row_count:,} rows"]
    if duration is not None:
        meta_bits.append(f"{duration * 1000:.0f} ms")
    if truncated:
        meta_bits.append(f"showing first {cap:,}")
    return (
        f'<table class="result"><thead><tr>{head}</tr></thead>'
        f'<tbody>{"".join(body_rows)}</tbody></table>'
        f'<div class="result-meta">{" · ".join(meta_bits)}</div>'
    )


def _render_chart_html(
    chart_config: dict[str, Any] | None,
    snapshot: dict[str, Any] | None,
    *,
    is_first_chart: bool,
) -> str:
    """Render a chart as inline Plotly HTML.

    Uses ``include_plotlyjs='cdn'`` on the first chart so plotly.js is
    fetched exactly once across the whole published page (subsequent
    charts pass ``include_plotlyjs=False``). Falls back silently to an
    empty string if Plotly fails for any reason — we'd rather drop the
    chart than break the whole share page.
    """
    if not chart_config or not snapshot:
        return ""
    chart_type = chart_config.get("chart_type")
    x = chart_config.get("x")
    y = chart_config.get("y")
    if not chart_type or not x or not y:
        return ""
    rows = snapshot.get("rows") or []
    if not rows:
        return ""

    try:
        import pandas as pd
        import plotly.express as px

        df = pd.DataFrame(rows)
        title = chart_config.get("title") or None
        color = chart_config.get("color")
        # Dark template that matches the published-page theme.
        common = {"title": title, "template": "plotly_dark"}
        y_first = y[0] if isinstance(y, list) and y else y

        if chart_type in {"line", "time_series"}:
            fig = px.line(df, x=x, y=y_first, color=color, **common)
        elif chart_type == "area":
            fig = px.area(df, x=x, y=y_first, color=color, **common)
        elif chart_type in {"bar", "histogram"}:
            fig = px.bar(df, x=x, y=y_first, color=color, **common)
        elif chart_type == "stacked_bar":
            fig = px.bar(
                df, x=x, y=y_first, color=color, barmode="stack", **common
            )
        elif chart_type == "scatter":
            fig = px.scatter(df, x=x, y=y_first, color=color, **common)
        elif chart_type in {"pie", "donut"}:
            fig = px.pie(
                df,
                names=x,
                values=y_first,
                hole=0.5 if chart_type == "donut" else 0,
                **common,
            )
        elif chart_type == "box":
            fig = px.box(df, x=x, y=y_first, color=color, **common)
        elif chart_type == "heatmap":
            fig = px.density_heatmap(df, x=x, y=y_first, **common)
        else:
            fig = px.bar(df, x=x, y=y_first, color=color, **common)

        # Tight margins + transparent paper so the chart blends with the
        # cell card the published page renders it inside.
        fig.update_layout(
            margin=dict(l=40, r=20, t=40 if title else 12, b=40),
            paper_bgcolor="rgba(0,0,0,0)",
            plot_bgcolor="rgba(0,0,0,0)",
            font=dict(color="#e5e7eb", size=12),
            legend=dict(font=dict(size=11)),
        )
        html_doc = fig.to_html(
            full_html=False,
            include_plotlyjs="cdn" if is_first_chart else False,
            config={
                "displaylogo": False,
                "responsive": True,
                "modeBarButtonsToRemove": ["lasso2d", "select2d"],
            },
        )
        return f'<div class="chart-card">{html_doc}</div>'
    except Exception:
        # Best-effort — never break the share page on a chart failure.
        return ""


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
    # Track whether we've already emitted the plotly.js script tag so
    # subsequent chart cells don't double-include it.
    chart_emitted = False
    for cell in notebook.cells:
        if isinstance(cell, MarkdownCell):
            parts.append(
                f'<section class="cell markdown">'
                f'<div class="markdown-body">{_render_markdown(cell.source)}</div>'
                f"</section>"
            )
        elif isinstance(cell, SQLCell):
            sql_html = _highlight_sql(cell.sql.strip() or "-- empty cell")
            snapshot = results.get(cell.id)
            table_html = _render_result_table(snapshot)
            chart_cfg = (
                cell.chart_config.model_dump() if cell.chart_config else None
            )
            chart_html = _render_chart_html(
                chart_cfg, snapshot, is_first_chart=not chart_emitted
            )
            if chart_html:
                chart_emitted = True
            parts.append(
                f'<section class="cell sql">'
                f'<div class="label">SQL</div>'
                f"<pre class=\"sql\">{sql_html}</pre>"
                f"{chart_html}"
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
            cfg_dict = (
                cell.chart_config.model_dump() if cell.chart_config else None
            )
            # Resolve the source SQL cell's result for the chart payload —
            # falls back to the first SQL cell's result if no source link.
            source_snap = (
                results.get(cell.source_cell_id) if cell.source_cell_id else None
            )
            if source_snap is None:
                source_snap = next(
                    (results[c.id] for c in notebook.cells if c.id in results),
                    None,
                )
            chart_html = _render_chart_html(
                cfg_dict, source_snap, is_first_chart=not chart_emitted
            )
            if chart_html:
                chart_emitted = True
                parts.append(
                    f'<section class="cell chart"><div class="label">Chart</div>'
                    f"{chart_html}</section>"
                )
            else:
                parts.append(
                    '<section class="cell chart">'
                    '<div class="label">Chart</div>'
                    '<div class="result-meta">Chart hidden — no result data '
                    "linked to this cell.</div></section>"
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
