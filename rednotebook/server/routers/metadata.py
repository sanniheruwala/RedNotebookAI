"""Metadata exploration endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from rednotebook.server.dependencies import build_trino_connector
from rednotebook.server.schemas import (
    CatalogListResponse,
    ColumnListResponse,
    SchemaListResponse,
    TableListItem,
    TableListResponse,
    TrinoConnectionPayload,
)

router = APIRouter()


def _connector(payload: TrinoConnectionPayload):
    try:
        return build_trino_connector(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/catalogs", response_model=CatalogListResponse)
def list_catalogs(payload: TrinoConnectionPayload) -> CatalogListResponse:
    try:
        catalogs = _connector(payload).list_catalogs()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CatalogListResponse(catalogs=catalogs)


@router.post("/schemas", response_model=SchemaListResponse)
def list_schemas(payload: TrinoConnectionPayload, catalog: str) -> SchemaListResponse:
    try:
        schemas = _connector(payload).list_schemas(catalog)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SchemaListResponse(schemas=schemas)


@router.post("/tables", response_model=TableListResponse)
def list_tables(payload: TrinoConnectionPayload, catalog: str, schema: str) -> TableListResponse:
    try:
        tables = _connector(payload).list_tables(catalog, schema)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return TableListResponse(
        tables=[
            TableListItem(
                catalog=t.catalog,
                schema_name=t.schema_name,
                name=t.name,
                table_type=t.table_type,
            )
            for t in tables
        ]
    )


@router.post("/columns", response_model=ColumnListResponse)
def list_columns(
    payload: TrinoConnectionPayload,
    catalog: str,
    schema: str,
    table: str,
) -> ColumnListResponse:
    try:
        cols = _connector(payload).list_columns(catalog, schema, table)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ColumnListResponse(columns=cols)
