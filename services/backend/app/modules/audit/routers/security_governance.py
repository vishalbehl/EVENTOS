from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.dependencies import DB, StepUpAuth
from app.modules.audit.models.audit_domain_tables import AccessReview
from app.modules.identity.models.user import User  # noqa: F401 - keeps postponed schema annotations resolvable
from app.modules.audit.application.commands import AccessReviewCommandService
from app.modules.platform.support_access import PlatformSupportScopeDependency, execute_platform_support_cursor_read
from app.schemas.cursor_pagination import CursorPage

router = APIRouter(prefix="/superadmin/security-governance", tags=["security-governance"])


class AccessReviewCreate(BaseModel):
    target_user_id: uuid.UUID
    review_type: Literal["PERIODIC", "ROLE_CHANGE", "BREAK_GLASS"]
    reason: str = Field(..., min_length=12, max_length=1000)
    scope_json: dict = Field(default_factory=dict)
    due_in_hours: int = Field(default=24, ge=1, le=720)


class AccessReviewDecision(BaseModel):
    status: Literal["APPROVED", "DENIED", "REMEDIATION_REQUIRED", "COMPLETED", "CANCELLED"]
    reason: str = Field(..., min_length=12, max_length=1000)
    version: int = Field(..., ge=1)


class AccessReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID | None
    target_user_id: uuid.UUID | None
    requested_by: uuid.UUID | None
    reviewer_id: uuid.UUID | None
    review_type: str
    status: str
    scope_json: dict
    request_reason: str | None
    decision_reason: str | None
    due_at: datetime | None
    decided_at: datetime | None
    version: int
    created_at: datetime


@router.get("/access-reviews", response_model=CursorPage[AccessReviewResponse])
async def list_access_reviews(db: DB, support_scope: PlatformSupportScopeDependency, review_status: str | None = Query(None, alias="status"), cursor: str | None = Query(None), limit: int = Query(50, ge=1, le=200)):
    stmt = select(AccessReview).where(AccessReview.organization_id == support_scope.organization_id)
    if review_status:
        stmt = stmt.where(AccessReview.status == review_status.upper())
    return await execute_platform_support_cursor_read(db, support_scope, stmt, timestamp_column=AccessReview.created_at, id_column=AccessReview.id, cursor=cursor, limit=limit, resource_type="access_reviews")


@router.post("/access-reviews", response_model=AccessReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_access_review(payload: AccessReviewCreate, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth):
    del step_up
    return await AccessReviewCommandService.create(db, scope=support_scope, payload=payload)


@router.patch("/access-reviews/{review_id}", response_model=AccessReviewResponse)
async def decide_access_review(review_id: uuid.UUID, payload: AccessReviewDecision, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth):
    del step_up
    return await AccessReviewCommandService.decide(
        db, scope=support_scope, review_id=review_id, payload=payload
    )
