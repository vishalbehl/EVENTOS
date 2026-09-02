"""Transaction-owning security-governance commands."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.tenant_context import TenantContextGuard
from app.modules.audit.models.audit_domain_tables import AccessReview
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User


class AccessReviewCommandService:
    """Own tenant-scoped access-review transactions and concurrency rules."""

    @staticmethod
    def _audit(scope, review: AccessReview, action: str, reason: str) -> AuditLog:
        return AuditLog(
            organization_id=scope.organization_id,
            actor_user_id=scope.actor.id,
            resource_type="access_review",
            resource_id=review.id,
            action_type=action,
            actor_role=scope.actor.platform_role or scope.actor.role,
            new_state={
                "review_type": review.review_type,
                "status": review.status,
                "target_user_id": str(review.target_user_id),
                "version": review.version,
            },
            change_diff={"reason": reason},
            is_sensitive=True,
        )

    @classmethod
    async def create(cls, db: AsyncSession, *, scope, payload) -> AccessReview:
        try:
            async with TenantContextGuard.scoped(db, scope.organization_id):
                target = await db.scalar(
                    select(User).where(
                        User.id == payload.target_user_id,
                        User.organization_id == scope.organization_id,
                    )
                )
                if not target:
                    raise HTTPException(status_code=404, detail="Target user not found.")
                review = AccessReview(
                    organization_id=scope.organization_id,
                    target_user_id=target.id,
                    requested_by=scope.actor.id,
                    review_type=payload.review_type,
                    status="OPEN",
                    scope_json=payload.scope_json,
                    request_reason=payload.reason,
                    due_at=datetime.now(timezone.utc) + timedelta(hours=payload.due_in_hours),
                )
                db.add(review)
                await db.flush()
                db.add(cls._audit(scope, review, "ACCESS_REVIEW_CREATED", payload.reason))
                await db.commit()
                await db.refresh(review)
                return review
        except Exception:
            await db.rollback()
            raise

    @classmethod
    async def decide(cls, db: AsyncSession, *, scope, review_id, payload) -> AccessReview:
        try:
            async with TenantContextGuard.scoped(db, scope.organization_id):
                review = await db.scalar(
                    select(AccessReview)
                    .where(
                        AccessReview.id == review_id,
                        AccessReview.organization_id == scope.organization_id,
                    )
                    .with_for_update()
                )
                if not review:
                    raise HTTPException(status_code=404, detail="Access review not found.")
                if review.version != payload.version:
                    raise HTTPException(
                        status_code=409,
                        detail={"code": "VERSION_CONFLICT", "current_version": review.version},
                    )
                if (
                    review.review_type == "BREAK_GLASS"
                    and payload.status == "APPROVED"
                    and review.requested_by == scope.actor.id
                ):
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "DUAL_CONTROL_REQUIRED",
                            "message": "Break-glass approval requires a different privileged reviewer.",
                        },
                    )
                review.status = payload.status
                review.reviewer_id = scope.actor.id
                review.decision_reason = payload.reason
                review.decided_at = datetime.now(timezone.utc)
                review.version += 1
                db.add(cls._audit(scope, review, "ACCESS_REVIEW_DECIDED", payload.reason))
                await db.commit()
                await db.refresh(review)
                return review
        except Exception:
            await db.rollback()
            raise
