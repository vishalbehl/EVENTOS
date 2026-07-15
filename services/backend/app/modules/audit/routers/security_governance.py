from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.dependencies import DB, StepUpAuth
from app.modules.audit.models.audit_domain_tables import AccessReview
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User
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


def audit(scope, review: AccessReview, action: str, reason: str) -> AuditLog:
    return AuditLog(organization_id=scope.organization_id, actor_user_id=scope.actor.id, resource_type="access_review", resource_id=review.id, action_type=action, actor_role=scope.actor.platform_role or scope.actor.role, new_state={"review_type": review.review_type, "status": review.status, "target_user_id": str(review.target_user_id), "version": review.version}, change_diff={"reason": reason}, is_sensitive=True)


@router.get("/access-reviews", response_model=CursorPage[AccessReviewResponse])
async def list_access_reviews(db: DB, support_scope: PlatformSupportScopeDependency, review_status: str | None = Query(None, alias="status"), cursor: str | None = Query(None), limit: int = Query(50, ge=1, le=200)):
    stmt = select(AccessReview).where(AccessReview.organization_id == support_scope.organization_id)
    if review_status:
        stmt = stmt.where(AccessReview.status == review_status.upper())
    return await execute_platform_support_cursor_read(db, support_scope, stmt, timestamp_column=AccessReview.created_at, id_column=AccessReview.id, cursor=cursor, limit=limit, resource_type="access_reviews")


@router.post("/access-reviews", response_model=AccessReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_access_review(payload: AccessReviewCreate, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth):
    del step_up
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        target = await db.scalar(select(User).where(User.id == payload.target_user_id, User.organization_id == support_scope.organization_id))
        if not target:
            raise HTTPException(status_code=404, detail="Target user not found.")
        review = AccessReview(organization_id=support_scope.organization_id, target_user_id=target.id, requested_by=support_scope.actor.id, review_type=payload.review_type, status="OPEN", scope_json=payload.scope_json, request_reason=payload.reason, due_at=datetime.now(timezone.utc) + timedelta(hours=payload.due_in_hours))
        db.add(review)
        await db.flush()
        db.add(audit(support_scope, review, "ACCESS_REVIEW_CREATED", payload.reason))
        await db.commit()
        await db.refresh(review)
        return review


@router.patch("/access-reviews/{review_id}", response_model=AccessReviewResponse)
async def decide_access_review(review_id: uuid.UUID, payload: AccessReviewDecision, db: DB, support_scope: PlatformSupportScopeDependency, step_up: StepUpAuth):
    del step_up
    async with TenantContextGuard.scoped(db, support_scope.organization_id):
        review = await db.scalar(select(AccessReview).where(AccessReview.id == review_id, AccessReview.organization_id == support_scope.organization_id).with_for_update())
        if not review:
            raise HTTPException(status_code=404, detail="Access review not found.")
        if review.version != payload.version:
            raise HTTPException(status_code=409, detail={"code": "VERSION_CONFLICT", "current_version": review.version})
        if review.review_type == "BREAK_GLASS" and payload.status == "APPROVED" and review.requested_by == support_scope.actor.id:
            raise HTTPException(status_code=409, detail={"code": "DUAL_CONTROL_REQUIRED", "message": "Break-glass approval requires a different privileged reviewer."})
        review.status = payload.status
        review.reviewer_id = support_scope.actor.id
        review.decision_reason = payload.reason
        review.decided_at = datetime.now(timezone.utc)
        review.version += 1
        db.add(audit(support_scope, review, "ACCESS_REVIEW_DECIDED", payload.reason))
        await db.commit()
        await db.refresh(review)
        return review
