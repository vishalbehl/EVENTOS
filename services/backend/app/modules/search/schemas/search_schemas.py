# =============================================================
# Conference Platform — Search Domain Pydantic Schemas
# app/modules/search/schemas/search_schemas.py
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import BaseModel


# ── Search Request ────────────────────────────────────────────

class SearchQueryIn(BaseModel):
    """Incoming search request payload."""
    q: str
    entity_types: Optional[List[str]] = None  # e.g. ["events", "speakers", "participants"]
    limit: int = 20


# ── Search Results ────────────────────────────────────────────

class SearchResultOut(BaseModel):
    """A single search result item."""
    entity_type: str          # "event" | "speaker" | "participant" | "session" etc.
    entity_id: str            # UUID string of the matched record
    title: str                # Primary display title
    subtitle: Optional[str] = None   # Secondary descriptor (e.g. event name for a speaker)
    score: Optional[float] = None    # ts_rank score for ordering
    excerpt: Optional[str] = None    # Snippet of matching content


class SearchResponse(BaseModel):
    """Paginated search response."""
    query: str
    total: int
    results: List[SearchResultOut]


# ── Search Jobs ───────────────────────────────────────────────

class SearchJobOut(BaseModel):
    """Status of a search reindex job."""
    id: uuid.UUID
    organization_id: uuid.UUID
    status: str   # pending | indexing | completed | failed
    created_at: datetime

    model_config = {"from_attributes": True}


class ReindexTriggerIn(BaseModel):
    """Request to trigger a search reindex for an organization."""
    organization_id: uuid.UUID
    entity_types: Optional[List[str]] = None  # None = all types


class PaginatedSearchJobs(BaseModel):
    items: List[SearchJobOut]
    total: int
