"""Notebook model + storage tests."""

import pytest

pytest.importorskip("pydantic")

from rednotebook.notebook.models import (  # noqa: E402
    MarkdownCell,
    Notebook,
    SQLCell,
    new_notebook,
)
from rednotebook.notebook.storage import load_notebook, save_notebook  # noqa: E402


def test_new_notebook_has_welcome_cell():
    nb = new_notebook("Demo")
    assert nb.metadata.title == "Demo"
    assert any(c.cell_type == "markdown" for c in nb.cells)


def test_immutable_add_cell():
    nb = Notebook()
    original_cells = list(nb.cells)
    updated = nb.add_cell(SQLCell(sql="SELECT 1"))
    assert nb.cells == original_cells  # original untouched
    assert len(updated.cells) == 1
    assert updated.cells[0].cell_type == "sql"


def test_remove_and_replace_cell():
    nb = Notebook().add_cell(MarkdownCell(source="hello"))
    cell = nb.cells[0]
    removed = nb.remove_cell(cell.id)
    assert removed.cells == []

    replaced = nb.replace_cell(cell.model_copy(update={"source": "world"}))
    assert replaced.cells[0].source == "world"


def test_move_cell_up_and_down():
    nb = Notebook().add_cell(MarkdownCell(source="a")).add_cell(MarkdownCell(source="b"))
    second = nb.cells[1]
    moved = nb.move_cell(second.id, "up")
    assert moved.cells[0].id == second.id
    moved_back = moved.move_cell(second.id, "down")
    assert moved_back.cells[1].id == second.id


def test_save_and_load_round_trip(tmp_path):
    nb = new_notebook("RoundTrip")
    nb = nb.add_cell(SQLCell(sql="SELECT 1"))
    path = tmp_path / "nb.json"
    save_notebook(nb, path)
    loaded = load_notebook(path)
    assert loaded.metadata.title == "RoundTrip"
    assert any(c.cell_type == "sql" for c in loaded.cells)
