"""Citation rendering for knowledge sources."""

from __future__ import annotations

from rednotebook.knowledge.models import KnowledgeSource


def short_citation(source: KnowledgeSource) -> str:
    """Return a compact citation string like ``[SQL: orders_overview]``."""
    label = source.source_type.value.replace("_", " ").upper()
    return f"[{label}: {source.title}]"


def render_citations(sources: list[KnowledgeSource]) -> str:
    """Render a markdown citations section."""
    if not sources:
        return ""
    lines = ["", "## Sources", ""]
    for i, src in enumerate(sources, start=1):
        lines.append(f"{i}. {short_citation(src)} (id: `{src.id}`)")
    return "\n".join(lines)
