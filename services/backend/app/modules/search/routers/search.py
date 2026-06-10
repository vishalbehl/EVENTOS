# =============================================================
# Conference Platform — Search Router
# app/modules/search/routers/search.py
#
# Tenant-scoped global search and Super Admin reindex endpoints.
# =============================================================

from __future__ import annotations

import uuid
from typing import Optional, List

from fastapi import APIRouter, Query, HTTPException, status

from app.dependencies import DB, SuperAdminOnly, ActiveUser
from app.modules.search.services.search_service import SearchService
from app.modules.search.schemas.search_schemas import (
    SearchResponse,
    ReindexTriggerIn,
    SearchJobOut,
    PaginatedSearchJobs,
)

router = APIRouter(prefix="/search", tags=["search"])


@router.get(
    "",
    response_model=SearchResponse,
    summary="Global multi-entity search",
)
async def global_search(
    current_user: ActiveUser,
    db: DB,
    q: str = Query(..., min_length=2, max_length=200, description="Search query string"),
    types: Optional[str] = Query(
        None,
        description="Comma-separated entity types: events,speakers,participants,sessions",
    ),
    limit: int = Query(20, ge=1, le=100),
) -> SearchResponse:
    """
    Perform a full-text search across all indexed entities within the
    authenticated user's organization. Results are ranked by relevance.

    Supports filtering by entity types via the `types` query parameter.
    Super admins searching without a valid org context receive an empty result.
    """
    org_id = current_user.organization_id
    if not org_id:
        return SearchResponse(query=q, total=0, results=[])

    entity_types = [t.strip() for t in types.split(",")] if types else None

    return await SearchService.search(
        db=db,
        organization_id=org_id,
        query=q,
        entity_types=entity_types,
        limit=limit,
    )


@router.post(
    "/reindex",
    response_model=SearchJobOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger a full search reindex for an organization (Super Admin)",
)
async def trigger_reindex(
    body: ReindexTriggerIn,
    _: SuperAdminOnly,
    db: DB,
) -> SearchJobOut:
    """
    Super Admin only. Enqueues a full reindex job for the specified organization.
    Returns the created SearchJob with its status. The actual indexing happens
    asynchronously in the Celery `search` queue.
    """
    return await SearchService.trigger_reindex(
        db=db,
        organization_id=body.organization_id,
        entity_types=body.entity_types,
    )


@router.get(
    "/jobs",
    response_model=PaginatedSearchJobs,
    summary="List search indexing jobs (Super Admin)",
)
async def list_search_jobs(
    _: SuperAdminOnly,
    db: DB,
    organization_id: Optional[uuid.UUID] = Query(None, description="Filter by organization"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
) -> PaginatedSearchJobs:
    """
    Super Admin only. Returns the history of all search reindex jobs,
    optionally filtered by organization.
    """
    return await SearchService.list_jobs(
        db=db,
        organization_id=organization_id,
        page=page,
        page_size=page_size,
    )
