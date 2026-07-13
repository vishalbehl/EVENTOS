# =============================================================
# Conference Platform — Search Indexer Tasks
# workers/tasks/search_tasks.py
#
# Celery tasks for building and maintaining the global search index.
# Runs on the dedicated `search` queue.
#
# Phase 1 entities indexed: events, speakers, participants, sessions
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import List, Optional

from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.db import get_db_session

logger = get_task_logger(__name__)


# ── Single Entity Indexer ─────────────────────────────────────

@app.task(
    bind=True,
    name="workers.tasks.search_tasks.index_entity",
    max_retries=3,
    default_retry_delay=30,
)
def index_entity(self, org_id: str, entity_type: str, entity_id: str) -> dict:
    """
    Index a single entity into the search documents table.

    Args:
        org_id: Organization UUID string
        entity_type: One of: events, speakers, participants, sessions
        entity_id: UUID string of the entity record
    """
    logger.info(f"[search] Indexing {entity_type}:{entity_id} for org={org_id}")
    org_uuid = uuid.UUID(org_id)
    entity_uuid = uuid.UUID(entity_id)

    try:
        content = _extract_content(org_uuid, entity_type, entity_uuid)
        if content is None:
            logger.warning(f"[search] No content extracted for {entity_type}:{entity_id}")
            return {"indexed": False, "reason": "entity_not_found"}

        _upsert_document(org_uuid, entity_type, entity_id, content)
        logger.info(f"[search] Indexed {entity_type}:{entity_id}")
        return {"indexed": True, "entity_type": entity_type, "entity_id": entity_id}

    except Exception as exc:
        logger.error(f"[search] Failed to index {entity_type}:{entity_id}: {exc}")
        raise self.retry(exc=exc)


# ── Organization Reindexer ────────────────────────────────────

@app.task(
    bind=True,
    name="workers.tasks.search_tasks.reindex_organization",
    max_retries=1,
    default_retry_delay=120,
)
def reindex_organization(
    self,
    org_id: str,
    job_id: str,
    entity_types: Optional[List[str]] = None,
) -> dict:
    """
    Full reindex of all entities for a given organization.

    Args:
        org_id: Organization UUID string
        job_id: SearchJob UUID string (for status updates)
        entity_types: List of entity types to index. None = all.
    """
    logger.info(f"[search] Starting reindex for org={org_id} job={job_id}")
    org_uuid = uuid.UUID(org_id)
    job_uuid = uuid.UUID(job_id)

    if entity_types is None:
        entity_types = ["events", "speakers", "participants", "sessions"]

    # Mark job as indexing
    _update_job_status(org_uuid, job_uuid, "indexing")

    indexed_count = 0
    failed_count = 0

    try:
        for entity_type in entity_types:
            entity_ids = _get_all_entity_ids(org_uuid, entity_type)
            logger.info(f"[search] Reindexing {len(entity_ids)} {entity_type} for org={org_id}")

            for eid in entity_ids:
                try:
                    content = _extract_content(org_uuid, entity_type, eid)
                    if content:
                        _upsert_document(org_uuid, entity_type, str(eid), content)
                        indexed_count += 1
                except Exception as exc:
                    logger.warning(f"[search] Failed to index {entity_type}:{eid}: {exc}")
                    failed_count += 1

        _update_job_status(org_uuid, job_uuid, "completed")
        logger.info(
            f"[search] Reindex complete for org={org_id}: "
            f"indexed={indexed_count} failed={failed_count}"
        )
        return {"indexed": indexed_count, "failed": failed_count, "status": "completed"}

    except Exception as exc:
        _update_job_status(org_uuid, job_uuid, "failed")
        raise self.retry(exc=exc)


# ── Content Extractors ────────────────────────────────────────

def _extract_content(
    org_id: uuid.UUID, entity_type: str, entity_id: uuid.UUID
) -> Optional[dict]:
    """
    Load an entity from the database and convert it to a searchable
    content dictionary. Returns None if the entity is not found.
    """
    with get_db_session(org_id) as db:
        if entity_type == "events":
            from app.modules.events.models.event import Event
            entity = db.get(Event, entity_id)
            if not entity or entity.organization_id != org_id:
                return None
            return {
                "title": entity.title or "",
                "subtitle": getattr(entity, "subtitle", "") or "",
                "description": getattr(entity, "description", "") or "",
                "location": getattr(entity, "location", "") or "",
                "status": entity.status or "",
                "organization_id": str(entity.organization_id),
            }

        elif entity_type == "speakers":
            from app.modules.events.models.speaker import Speaker
            from app.modules.events.models.event import Event
            entity = db.get(Speaker, entity_id)
            event = db.get(Event, entity.event_id) if entity else None
            if not entity or not event or event.organization_id != org_id:
                return None
            return {
                "name": entity.name or "",
                "full_name": entity.name or "",
                "email": getattr(entity, "email", "") or "",
                "organization": getattr(entity, "organization", "") or "",
                "bio": getattr(entity, "bio", "") or "",
                "organization_id": str(org_id),
            }

        elif entity_type == "participants":
            from app.modules.registration.models.participant import Participant
            from app.modules.events.models.event import Event
            entity = db.get(Participant, entity_id)
            event = db.get(Event, entity.event_id) if entity else None
            if not entity or not event or event.organization_id != org_id:
                return None
            return {
                "full_name": entity.full_name or "",
                "email": entity.email or "",
                "organization": getattr(entity, "organization", "") or "",
                "organization_id": str(org_id),
            }

        elif entity_type == "sessions":
            from app.modules.events.models.session import Session
            from app.modules.events.models.event import Event
            entity = db.get(Session, entity_id)
            event = db.get(Event, entity.event_id) if entity else None
            if not entity or not event or event.organization_id != org_id:
                return None
            return {
                "title": entity.title or "",
                "code": getattr(entity, "code", "") or "",
                "description": getattr(entity, "description", "") or "",
                "organization_id": str(org_id),
            }

    return None


def _get_all_entity_ids(org_id: uuid.UUID, entity_type: str) -> List[uuid.UUID]:
    """Fetch all entity IDs for an org and entity type."""
    from sqlalchemy import select

    with get_db_session(org_id) as db:
        if entity_type == "events":
            from app.modules.events.models.event import Event
            result = db.execute(select(Event.id).where(Event.organization_id == org_id))
            return [row[0] for row in result.all()]

        elif entity_type == "speakers":
            from app.modules.events.models.speaker import Speaker
            # Speakers belong to events; get via organization_id on event join
            from app.modules.events.models.event import Event
            result = db.execute(
                select(Speaker.id).join(Event, Event.id == Speaker.event_id).where(
                    Event.organization_id == org_id
                )
            )
            return [row[0] for row in result.all()]

        elif entity_type == "participants":
            from app.modules.registration.models.participant import Participant
            from app.modules.events.models.event import Event
            result = db.execute(
                select(Participant.id)
                .join(Event, Event.id == Participant.event_id)
                .where(Event.organization_id == org_id)
            )
            return [row[0] for row in result.all()]

        elif entity_type == "sessions":
            from app.modules.events.models.session import Session
            from app.modules.events.models.event import Event
            result = db.execute(
                select(Session.id).join(Event, Event.id == Session.event_id).where(
                    Event.organization_id == org_id
                )
            )
            return [row[0] for row in result.all()]

    return []


def _upsert_document(
    org_id: uuid.UUID,
    entity_type: str,
    entity_id: str,
    content: dict,
) -> None:
    """Write or update a SearchDocument record for the given entity."""
    from sqlalchemy import select, and_
    from app.modules.search.models.search import SearchIndex, SearchDocument

    with get_db_session(org_id) as db:
        # Get or create the index
        index = db.execute(
            select(SearchIndex).where(
                and_(
                    SearchIndex.organization_id == org_id,
                    SearchIndex.index_name == entity_type,
                )
            )
        ).scalar_one_or_none()

        if index is None:
            index = SearchIndex(
                id=uuid.uuid4(),
                organization_id=org_id,
                index_name=entity_type,
            )
            db.add(index)
            db.flush()

        # Upsert the document
        doc = db.execute(
            select(SearchDocument).where(
                and_(
                    SearchDocument.index_id == index.id,
                    SearchDocument.document_id == entity_id,
                )
            )
        ).scalar_one_or_none()

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


def _update_job_status(org_id: uuid.UUID, job_id: uuid.UUID, status: str) -> None:
    """Update a SearchJob status record."""
    from app.modules.search.models.search import SearchJob

    try:
        with get_db_session(org_id) as db:
            from sqlalchemy import select
            job = db.execute(
                select(SearchJob).where(
                    SearchJob.id == job_id,
                    SearchJob.organization_id == org_id,
                )
            ).scalar_one_or_none()
            if job:
                job.status = status
    except Exception as exc:
        logger.warning(f"[search] Failed to update job status {job_id}: {exc}")
