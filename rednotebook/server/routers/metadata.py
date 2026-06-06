"""Metadata exploration endpoints (connector-agnostic)."""

from __future__ import annotations

from fastapi import APIRouter, Body, HTTPException

from rednotebook.server.dependencies import build_connector
from rednotebook.server.schemas import (
    CatalogListResponse,
    ColumnListResponse,
    ConnectionPayload,
    SchemaListResponse,
    TableListItem,
    TableListResponse,
)

router = APIRouter()


# FastAPI needs a discriminator hint when the body type is a Union.
# `Body(..., discriminator="connector_type")` wires the same logic at the
# route level that the schema uses internally.
ConnectionBody = Body(..., discriminator="connector_type")  # type: ignore[arg-type]


def _connector(payload):  # type: ignore[no-untyped-def]
    try:
        return build_connector(payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/catalogs", response_model=CatalogListResponse)
def list_catalogs(payload: ConnectionPayload = ConnectionBody) -> CatalogListResponse:
    try:
        catalogs = _connector(payload).list_catalogs()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return CatalogListResponse(catalogs=catalogs)


@router.post("/schemas", response_model=SchemaListResponse)
def list_schemas(
    catalog: str,
    payload: ConnectionPayload = ConnectionBody,
) -> SchemaListResponse:
    try:
        schemas = _connector(payload).list_schemas(catalog)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return SchemaListResponse(schemas=schemas)


@router.post("/tables", response_model=TableListResponse)
def list_tables(
    catalog: str,
    schema: str,
    payload: ConnectionPayload = ConnectionBody,
) -> TableListResponse:
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
    catalog: str,
    schema: str,
    table: str,
    payload: ConnectionPayload = ConnectionBody,
) -> ColumnListResponse:
    try:
        cols = _connector(payload).list_columns(catalog, schema, table)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return ColumnListResponse(columns=cols)


