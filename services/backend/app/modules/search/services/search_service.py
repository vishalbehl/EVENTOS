# =============================================================
# Conference Platform — Search Service
# app/modules/search/services/search_service.py
#
# Provides tenant-scoped full-text search using PostgreSQL
# tsvector / plainto_tsquery. All queries are org-isolated.
# Documents are indexed by the Celery search_tasks worker.
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import HTTPException
from loguru import logger
from sqlalchemy import select, func, text, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import JSONB

from app.modules.search.models.search import SearchIndex, SearchDocument, SearchJob
from app.modules.search.schemas.search_schemas import (
    SearchResultOut,
    SearchResponse,
    SearchJobOut,
    PaginatedSearchJobs,
)


# Supported entity types for Phase 1
SUPPORTED_ENTITY_TYPES = ["events", "speakers", "participants", "sessions"]


class SearchService:
    """
    Service for tenant-scoped global full-text search.
    Uses PostgreSQL tsvector with English stemming for matching.
    """

    # ── Search ────────────────────────────────────────────────

    @staticmethod
    async def search(
        db: AsyncSession,
        organization_id: uuid.UUID,
        query: str,
        entity_types: Optional[List[str]] = None,
        limit: int = 20,
    ) -> SearchResponse:
        """
        Execute a full-text search against all indexed documents
        for the given organization, optionally filtered by entity type.
        """
        if not query or not query.strip():
            return SearchResponse(query=query, total=0, results=[])

        # Sanitize and limit
        query = query.strip()[:200]
        limit = min(limit, 100)

        # Filter entity types to supported list
        if entity_types:
            entity_types = [t for t in entity_types if t in SUPPORTED_ENTITY_TYPES]
        else:
            entity_types = SUPPORTED_ENTITY_TYPES

        # Get the org's search index IDs
        index_stmt = select(SearchIndex.id).where(
            SearchIndex.organization_id == organization_id,
            SearchIndex.index_name.in_(entity_types),
        )
        index_result = await db.execute(index_stmt)
        index_ids = [row[0] for row in index_result.all()]

        if not index_ids:
            return SearchResponse(query=query, total=0, results=[])

        # PostgreSQL full-text search on JSONB content cast to text
        # We cast the content JSONB to text and run plainto_tsquery against it
        search_stmt = (
            select(SearchDocument)
            .where(
                SearchDocument.index_id.in_(index_ids),
                func.to_tsvector("english", func.cast(SearchDocument.content, text("TEXT"))).op("@@")(
                    func.plainto_tsquery("english", query)
                ),
            )
            .order_by(
                func.ts_rank(
                    func.to_tsvector("english", func.cast(SearchDocument.content, text("TEXT"))),
                    func.plainto_tsquery("english", query),
                ).desc()
            )
            .limit(limit)
        )

        result = await db.execute(search_stmt)
        documents = result.scalars().all()

        # Map index_id → index_name for entity type resolution
        idx_name_stmt = select(SearchIndex.id, SearchIndex.index_name).where(
            SearchIndex.id.in_(index_ids)
        )
        idx_name_result = await db.execute(idx_name_stmt)
        index_name_map = {row[0]: row[1] for row in idx_name_result.all()}

        results = []
        for doc in documents:
            content = doc.content or {}
            entity_type = index_name_map.get(doc.index_id, "unknown")
            # Strip trailing 's' for display (events→event, speakers→speaker)
            display_type = entity_type.rstrip("s")

            results.append(
                SearchResultOut(
                    entity_type=display_type,
                    entity_id=doc.document_id,
                    title=content.get("title") or content.get("name") or content.get("full_name") or doc.document_id,
                    subtitle=content.get("subtitle") or content.get("event_name") or content.get("organization_name"),
                    excerpt=_build_excerpt(content, query),
                )
            )

        return SearchResponse(query=query, total=len(results), results=results)

    # ── Index Operations ──────────────────────────────────────

    @staticmethod
    async def get_or_create_index(
        db: AsyncSession,
        organization_id: uuid.UUID,
        index_name: str,
    ) -> SearchIndex:
        """Get or create a SearchIndex for the org + entity type."""
        stmt = select(SearchIndex).where(
            and_(
                SearchIndex.organization_id == organization_id,
                SearchIndex.index_name == index_name,
            )
        )
        result = await db.execute(stmt)
        index = result.scalar_one_or_none()

        if index is None:
            index = SearchIndex(
                id=uuid.uuid4(),
                organization_id=organization_id,
                index_name=index_name,
            )
            db.add(index)
            await db.flush()

        return index

    @staticmethod
    async def index_document(
        db: AsyncSession,
        organization_id: uuid.UUID,
        entity_type: str,
        entity_id: str,
        content: dict,
    ) -> None:
        """
        Upsert a single document into the search index for the given entity type.
        Called from the Celery search_tasks worker.
        """
        index = await SearchService.get_or_create_index(db, organization_id, entity_type)

        stmt = select(SearchDocument).where(
            and_(
                SearchDocument.index_id == index.id,
                SearchDocument.document_id == entity_id,
            )
        )
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()

        if doc is None:
            doc = SearchDocument(
                id=uuid.uuid4(),
                index_id=index.id,
                document_id=entity_id,
                content=content,
            )
            db.add(doc)
        else:
            doc.content = content

        await db.flush()

    @staticmethod
    async def trigger_reindex(
        db: AsyncSession,
        organization_id: uuid.UUID,
        entity_types: Optional[List[str]] = None,
        actor_user_id: Optional[uuid.UUID] = None,
        reason: Optional[str] = None,
        idempotency_key: Optional[str] = None,
    ) -> SearchJobOut:
        """
        Create a SearchJob record and enqueue the Celery reindex task.
        """
        if idempotency_key:
            existing = await db.scalar(select(SearchJob).where(
                SearchJob.organization_id == organization_id,
                SearchJob.idempotency_key == idempotency_key,
            ))
            if existing:
                requested_entities = entity_types or SUPPORTED_ENTITY_TYPES
                if existing.entity_types != requested_entities or existing.request_reason != reason:
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT", "message": "Idempotency key was already used with different reindex parameters."})
                return SearchJobOut.model_validate(existing)

        now = datetime.now(timezone.utc)
        job = SearchJob(
            id=uuid.uuid4(),
            organization_id=organization_id,
            status="pending",
            entity_types=entity_types or SUPPORTED_ENTITY_TYPES,
            records_processed=0,
            requested_by=actor_user_id,
            request_reason=reason,
            idempotency_key=idempotency_key,
            queued_at=now,
        )
        db.add(job)
        await db.flush()

        # Enqueue the Celery task (imported lazily to avoid circular imports)
        try:
            from workers.tasks.search_tasks import reindex_organization
            reindex_organization.delay(
                str(organization_id),
                str(job.id),
                job.entity_types,
            )
            logger.info(f"[search] Reindex job {job.id} queued for org={organization_id}")
        except Exception:
            logger.exception("[search] Could not enqueue reindex task")
            job.status = "failed"
            job.error_code = "QUEUE_UNAVAILABLE"
            job.error_detail = "Search worker dispatch failed."
            job.finished_at = datetime.now(timezone.utc)

        return SearchJobOut.model_validate(job)

    # ── Job Status ────────────────────────────────────────────

    @staticmethod
    async def list_jobs(
        db: AsyncSession,
        organization_id: Optional[uuid.UUID] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> PaginatedSearchJobs:
        """List search indexing jobs, optionally filtered by organization."""
        filters = []
        if organization_id:
            filters.append(SearchJob.organization_id == organization_id)

        count_total = await db.scalar(
            select(func.count()).select_from(SearchJob).where(*filters)
        ) or 0

        stmt = (
            select(SearchJob)
            .where(*filters)
            .order_by(SearchJob.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        result = await db.execute(stmt)
        jobs = result.scalars().all()

        return PaginatedSearchJobs(
            items=[SearchJobOut.model_validate(j) for j in jobs],
            total=count_total,
        )


# ── Private Helpers ───────────────────────────────────────────

def _build_excerpt(content: dict, query: str) -> Optional[str]:
    """
    Build a short text excerpt from the content dict that contains
    words from the query. Returns the first matching field snippet.
    """
    query_words = set(query.lower().split())
    for field in ["description", "abstract", "bio", "notes"]:
        value = content.get(field, "")
        if not value:
            continue
        value_lower = value.lower()
        if any(w in value_lower for w in query_words):
            # Truncate to 200 chars around the first match
            return value[:200] + ("..." if len(value) > 200 else "")
    return None
