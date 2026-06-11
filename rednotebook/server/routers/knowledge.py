"""Knowledge notebook endpoints."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException

from rednotebook.ai.base import AIContext
from rednotebook.ai.errors import AIProviderError
from rednotebook.ai.registry import get_provider
from rednotebook.config.settings import get_settings
from rednotebook.knowledge.models import KnowledgeSource, SourceType
from rednotebook.knowledge.store import InternalKnowledgeStore
from rednotebook.security.secrets import mask_secrets
from rednotebook.server.dependencies import knowledge_store_dep
from rednotebook.server.schemas import (
    AddSourceRequest,
    CreateNotebookRequest,
    KnowledgeChatRequest,
    KnowledgeChatResponse,
    KnowledgeCitation,
    KnowledgeNotebookListResponse,
    KnowledgeSourceListResponse,
    KnowledgeStudioRequest,
    KnowledgeStudioResponse,
)

router = APIRouter()


@router.post("/notebooks")
def create_notebook(
    request: CreateNotebookRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    notebook = store.create_notebook(request.name, request.description)
    return notebook


@router.get("/notebooks", response_model=KnowledgeNotebookListResponse)
def list_notebooks(
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeNotebookListResponse:
    return KnowledgeNotebookListResponse(notebooks=store.list_notebooks())


@router.get("/notebooks/{notebook_id}")
def get_notebook(
    notebook_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    try:
        return store.get_notebook(notebook_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/notebooks/{notebook_id}")
def delete_notebook(
    notebook_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    return {"ok": store.delete_notebook(notebook_id)}


@router.post("/sources", response_model=KnowledgeSource)
def add_source(
    request: AddSourceRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeSource:
    try:
        source = KnowledgeSource(
            notebook_id=request.notebook_id,
            source_type=SourceType(request.source_type),
            title=request.title,
            content=request.content,
            metadata=request.metadata,
        )
        return store.add_source(source)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/notebooks/{notebook_id}/sources", response_model=KnowledgeSourceListResponse)
def list_sources(
    notebook_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeSourceListResponse:
    try:
        return KnowledgeSourceListResponse(sources=store.list_sources(notebook_id))
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/notebooks/{notebook_id}/sources/{source_id}")
def delete_source(
    notebook_id: str,
    source_id: str,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
):
    return {"ok": store.delete_source(notebook_id, source_id)}


def _source_to_context_chunk(source: KnowledgeSource) -> str:
    """Render a source as a compact text chunk for the AI prompt."""
    header = f"[{source.source_type.value.upper()}] {source.title}"
    body = mask_secrets(source.content or "")
    meta_lines: list[str] = []
    if source.source_type is SourceType.SCHEMA:
        cols = source.metadata.get("columns") or []
        if cols:
            meta_lines.append(
                "columns: "
                + ", ".join(
                    f"{c.get('name')}({c.get('data_type')})" for c in cols[:24]
                )
            )
    elif source.source_type is SourceType.QUERY_RESULT:
        rc = source.metadata.get("row_count")
        cc = source.metadata.get("column_count")
        cols = source.metadata.get("columns") or []
        if rc is not None or cc is not None:
            meta_lines.append(f"row_count={rc}, column_count={cc}")
        if cols:
            meta_lines.append(
                "columns: "
                + ", ".join(f"{c.get('name')}({c.get('data_type')})" for c in cols[:24])
            )
    elif source.source_type is SourceType.PROFILE:
        sens = source.metadata.get("sensitive_columns") or []
        if sens:
            meta_lines.append("sensitive_columns: " + ", ".join(sens))
    return "\n".join([header, *meta_lines, body]).strip()


_CITATION_RE = re.compile(r"\[(\d{1,3})\]")
_GROUNDING_RULES = (
    "You are a NotebookLM-style grounded research assistant. Answer the "
    "user's question using ONLY the SOURCES listed below. Rules:\n"
    "  * Every factual claim must be followed by a citation marker in the "
    "    form `[n]`, where n is the source number you used (1-indexed). "
    "    Multiple markers like `[1][3]` are fine when several sources back "
    "    the same claim.\n"
    "  * Do NOT cite source titles inline — only `[n]`.\n"
    "  * If the sources don't answer the question, say so plainly with "
    "    \"Not in the provided sources.\" Do not invent facts.\n"
    "  * Be concise but specific. Prefer numbers, names, and dates from "
    "    the sources over generic restatements.\n"
)


def _format_sources_for_prompt(selected) -> str:  # type: ignore[no-untyped-def]
    """Render the sources as a numbered block the model can cite by [n]."""
    lines: list[str] = []
    for i, src in enumerate(selected, start=1):
        chunk = _source_to_context_chunk(src)
        lines.append(f"Source {i}: {src.title}\n{chunk}")
    return "\n\n---\n\n".join(lines)


def _extract_citations(
    answer: str,
    selected,  # type: ignore[no-untyped-def]
) -> list[KnowledgeCitation]:
    """Parse `[n]` markers from the model output, map them to source ids.

    Returns each unique marker once, in the order it first appears in the
    answer. Out-of-range markers (model hallucinating a source #99) are
    dropped — clicking through to a non-existent source is worse than just
    showing fewer chips.
    """
    seen: set[int] = set()
    citations: list[KnowledgeCitation] = []
    for match in _CITATION_RE.finditer(answer):
        n = int(match.group(1))
        if n in seen:
            continue
        seen.add(n)
        if 1 <= n <= len(selected):
            src = selected[n - 1]
            citations.append(
                KnowledgeCitation(marker=n, source_id=src.id, title=src.title)
            )
    return citations


@router.post("/chat", response_model=KnowledgeChatResponse)
def chat(
    request: KnowledgeChatRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeChatResponse:
    """Ask the AI a question grounded in the notebook's knowledge sources."""
    try:
        all_sources = store.list_sources(request.notebook_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    selected = (
        [s for s in all_sources if s.id in set(request.source_ids)]
        if request.source_ids
        else all_sources
    )

    if not selected:
        return KnowledgeChatResponse(
            answer="No knowledge sources are available yet. Add SQL, schemas, or results from cells.",
            provider="none",
            cited_source_ids=[],
        )

    settings = get_settings()
    provider = get_provider(settings)
    selected = selected[:12]
    grounded_prompt = (
        f"{_GROUNDING_RULES}\n"
        f"QUESTION: {request.question}\n\n"
        f"SOURCES:\n\n{_format_sources_for_prompt(selected)}"
    )
    context = AIContext()
    try:
        answer = provider.explain_sql(grounded_prompt, context)
    except AIProviderError as exc:
        model = f" / {exc.model}" if exc.model else ""
        raise HTTPException(
            status_code=502,
            detail=f"{exc.provider}{model}: {exc}",
        ) from exc
    citations = _extract_citations(answer, selected)
    return KnowledgeChatResponse(
        answer=answer,
        provider=provider.name,
        cited_source_ids=[c.source_id for c in citations] or [s.id for s in selected],
        citations=citations,
    )


_STUDIO_SECTION_PROMPTS: dict[str, str] = {
    "overview": (
        "Write a 2-3 paragraph executive overview of what this knowledge "
        "notebook is about, what the sources collectively reveal, and what "
        "the most interesting tensions or gaps are. Plain prose, no "
        "headings, ~200 words."
    ),
    "faq": (
        "Generate 6-8 frequently-asked questions a stakeholder might ask "
        "about this notebook's subject matter, each with a 2-3 sentence "
        "answer grounded in the sources. Format as Markdown:\n"
        "  ### Q: ...\n"
        "  A: ... `[n]`"
    ),
    "study_guide": (
        "Produce a study guide as Markdown with three sections:\n"
        "  ## Key terms — bullet list of 6-10 terms with one-line definitions "
        "    grounded in the sources, each with a `[n]` citation.\n"
        "  ## Core questions — 5 open-ended questions an analyst should be "
        "    able to answer after reading these sources.\n"
        "  ## Read this if you want to know — 3 short pointers naming which "
        "    sources cover which topic (cite by `[n]`)."
    ),
    "suggested_questions": (
        "Suggest 8 follow-up questions the user could ask this notebook "
        "next. Each should be answerable with a quick SQL query or chart. "
        "Markdown bulleted list, no preamble."
    ),
}


@router.post("/studio", response_model=KnowledgeStudioResponse)
def studio(
    request: KnowledgeStudioRequest,
    store: InternalKnowledgeStore = Depends(knowledge_store_dep),
) -> KnowledgeStudioResponse:
    """NotebookLM-style structured artifacts for a knowledge notebook.

    One call returns Markdown for each requested section
    (``overview``, ``faq``, ``study_guide``, ``suggested_questions``) plus a
    deduplicated list of citations across all sections. Each section is a
    separate LLM call so a 502 from one section doesn't lose the others.
    """
    try:
        all_sources = store.list_sources(request.notebook_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    selected = (
        [s for s in all_sources if s.id in set(request.source_ids)]
        if request.source_ids
        else all_sources
    )

    if not selected:
        return KnowledgeStudioResponse(
            provider="none",
            sections={
                k: "No knowledge sources yet. Add SQL, schemas, or results "
                "from cells, then come back."
                for k in request.sections
            },
            citations=[],
        )

    settings = get_settings()
    provider = get_provider(settings)
    selected = selected[:12]
    sources_block = _format_sources_for_prompt(selected)

    sections: dict[str, str] = {}
    all_citations: list[KnowledgeCitation] = []
    seen_markers: set[int] = set()
    for key in request.sections:
        instruction = _STUDIO_SECTION_PROMPTS.get(key)
        if not instruction:
            continue
        prompt = (
            f"{_GROUNDING_RULES}\n"
            f"TASK: {instruction}\n\n"
            f"SOURCES:\n\n{sources_block}"
        )
        try:
            text = provider.explain_sql(prompt, AIContext())
        except AIProviderError as exc:
            text = (
                f"_Section unavailable — provider error: {exc}._"
            )
        sections[key] = text
        for cit in _extract_citations(text, selected):
            if cit.marker in seen_markers:
                continue
            seen_markers.add(cit.marker)
            all_citations.append(cit)

    return KnowledgeStudioResponse(
        provider=provider.name,
        sections=sections,
        citations=all_citations,
    )
