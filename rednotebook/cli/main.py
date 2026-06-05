"""Typer-based CLI for RedNotebook AI."""

from __future__ import annotations

import json
from pathlib import Path

import typer
from pydantic import SecretStr
from rich.console import Console
from rich.table import Table

from rednotebook import __version__
from rednotebook.config.settings import get_settings
from rednotebook.connectors.trino import TrinoConnectionConfig, TrinoConnector
from rednotebook.notebook.storage import load_notebook

app = typer.Typer(help="RedNotebook AI command-line interface.")
console = Console()


@app.callback()
def _root() -> None:
    """Top-level callback so subcommands work."""


@app.command()
def version() -> None:
    """Print the package version."""
    console.print(f"RedNotebook AI {__version__}")


@app.command()
def run(
    host: str = typer.Option("0.0.0.0", help="Host to bind"),
    port: int = typer.Option(8000, help="Port to bind"),
    reload: bool = typer.Option(False, help="Auto-reload (dev only)"),
) -> None:
    """Launch the FastAPI server."""
    import uvicorn

    uvicorn.run(
        "rednotebook.server.main:app",
        host=host,
        port=port,
        reload=reload,
    )


@app.command(name="validate-config")
def validate_config() -> None:
    """Validate the .env / settings configuration."""
    settings = get_settings()
    console.print(f"[bold]App:[/bold] {settings.app_name} ({settings.app_env})")
    console.print(f"[bold]AI provider:[/bold] {settings.ai_provider}")
    console.print(f"[bold]Knowledge provider:[/bold] {settings.knowledge_provider}")
    console.print(f"[bold]Allow write queries:[/bold] {settings.allow_write_queries}")
    console.print(f"[bold]Notebook storage:[/bold] {settings.notebook_storage_dir}")
    console.print(f"[bold]Knowledge storage:[/bold] {settings.knowledge_storage_dir}")
    console.print("[green]Configuration looks valid.[/green]")


@app.command(name="test-trino")
def test_trino(
    host: str = typer.Option(..., help="Trino host"),
    user: str = typer.Option(..., help="Trino user"),
    port: int = typer.Option(443, help="Trino port"),
    scheme: str = typer.Option("https", help="http or https"),
    password: str | None = typer.Option(None, help="Password / token"),
    catalog: str | None = typer.Option(None),
    schema: str | None = typer.Option(None),
    verify_ssl: bool = typer.Option(True),
) -> None:
    """Test a Trino HTTPS connection."""
    cfg = TrinoConnectionConfig(
        connection_name="cli",
        connector_type="trino",
        host=host,
        port=port,
        scheme=scheme,
        user=user,
        password=SecretStr(password) if password else None,
        catalog=catalog,
        schema=schema,
        verify_ssl=verify_ssl,
    )
    connector = TrinoConnector(cfg)
    ok = connector.test_connection()
    if ok:
        console.print("[green]Connection successful.[/green]")
    else:
        console.print("[red]Connection failed.[/red]")
        raise typer.Exit(code=1)


@app.command(name="profile-file")
def profile_file(path: Path) -> None:
    """Profile a local CSV file (basic stats)."""
    import csv

    if not path.exists():
        console.print(f"[red]File not found: {path}[/red]")
        raise typer.Exit(code=1)
    with path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames or []
    from rednotebook.connectors.base import ColumnInfo, QueryResult
    from rednotebook.profiling.profiler import profile_result

    columns = [ColumnInfo(name=n, data_type="string") for n in fieldnames]
    result = QueryResult(columns=columns, rows=rows, row_count=len(rows), duration_seconds=0.0)
    profile = profile_result(result)
    table = Table(title=f"Profile: {path.name}")
    for h in ("column", "type", "nulls", "distinct", "pii"):
        table.add_column(h)
    for col in profile.columns:
        table.add_row(
            col.name,
            col.data_type,
            str(col.null_count),
            str(col.distinct_count),
            col.pii_classification,
        )
    console.print(table)


@app.command(name="export-notebook")
def export_notebook(path: Path, out: Path = typer.Option(Path("export.json"))) -> None:
    """Round-trip a notebook through the JSON loader as a validation check."""
    notebook = load_notebook(path)
    out.write_text(json.dumps(notebook.model_dump(mode="json"), indent=2, default=str), encoding="utf-8")
    console.print(f"[green]Exported notebook to {out}[/green]")


if __name__ == "__main__":
    app()
