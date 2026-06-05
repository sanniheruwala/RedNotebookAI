"""Knowledge store + source builder tests."""

import pytest

pytest.importorskip("pydantic")

from rednotebook.knowledge.models import KnowledgeSource, SourceType  # noqa: E402
from rednotebook.knowledge.source_builder import (  # noqa: E402
    build_markdown_source,
    build_sql_source,
)
from rednotebook.knowledge.store import InternalKnowledgeStore  # noqa: E402


def test_create_and_list_notebook(tmp_path):
    store = InternalKnowledgeStore(tmp_path)
    nb = store.create_notebook("Demo", description="d")
    assert nb.id
    notebooks = store.list_notebooks()
    assert any(n.id == nb.id for n in notebooks)


def test_add_and_list_sources(tmp_path):
    store = InternalKnowledgeStore(tmp_path)
    nb = store.create_notebook("Demo")
    src = build_sql_source(nb.id, title="orders", sql="SELECT * FROM orders")
    store.add_source(src)
    listed = store.list_sources(nb.id)
    assert len(listed) == 1
    assert listed[0].source_type is SourceType.SQL_QUERY


def test_delete_source(tmp_path):
    store = InternalKnowledgeStore(tmp_path)
    nb = store.create_notebook("Demo")
    src = build_markdown_source(nb.id, "note", "hello")
    store.add_source(src)
    assert store.delete_source(nb.id, src.id) is True
    assert store.list_sources(nb.id) == []


def test_secrets_masked_in_sql_source():
    src = build_sql_source(
        "nb",
        "leaky",
        "SELECT * FROM t WHERE api_key='AKIAABCDEFGHIJKLMNOP'",
    )
    assert "AKIAABCDEFGHIJKLMNOP" not in src.content
