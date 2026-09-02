"""Transaction-owning commands for abstract reviewer administration."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractAssignment, AbstractReviewer, AbstractReview
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractReviewerCommandService:
    """Manage reviewers inside explicit application transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _audit(self, *, event, user, action: str, reviewer_id, old=None, new=None):
        await AuditService.write_log_sync(
            AuditContext(
                action_type=action,
                resource_type="abstract",
                resource_id=reviewer_id,
                actor_user_id=user.id,
                organization_id=event.organization_id,
                actor_role=getattr(user, "role", None),
                old_state=old or {},
                new_state={**(new or {}), "event_id": str(event.id)},
            ),
            self.db,
        )

    async def create(self, *, payload: dict, event, user) -> AbstractReviewer:
        try:
            row = AbstractReviewer(
                organization_id=event.organization_id,
                event_id=event.id,
                full_name=payload["full_name"],
                email=str(payload["email"]).lower(),
                expertise_topics=payload["expertise_topics"],
                capacity=payload["capacity"],
                status=payload["status"],
                invited_at=datetime.now(timezone.utc),
            )
            self.db.add(row)
            await self.db.flush()
            await self._audit(event=event, user=user, action="ABSTRACT_REVIEWER_CREATED", reviewer_id=row.id,
                              new={"email": row.email, "status": row.status})
            await self.db.commit()
            await self.db.refresh(row)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, reviewer_id, payload: dict, event, user) -> AbstractReviewer:
        try:
            row = await self.db.scalar(
                select(AbstractReviewer).where(
                    AbstractReviewer.id == reviewer_id,
                    AbstractReviewer.event_id == event.id,
                    AbstractReviewer.organization_id == event.organization_id,
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Reviewer not found")
            old = {"status": row.status, "capacity": row.capacity}
            for key, value in payload.items():
                if key == "email" and value is not None:
                    value = str(value).lower()
                setattr(row, key, value)
            await self._audit(event=event, user=user, action="ABSTRACT_REVIEWER_UPDATED", reviewer_id=row.id,
                              old=old, new={"status": row.status, "capacity": row.capacity})
            await self.db.commit()
            await self.db.refresh(row)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def delete(self, *, reviewer_id, event, user) -> None:
        try:
            row = await self.db.scalar(
                select(AbstractReviewer).where(
                    AbstractReviewer.id == reviewer_id,
                    AbstractReviewer.event_id == event.id,
                    AbstractReviewer.organization_id == event.organization_id,
                ).with_for_update()
            )
            if row is None:
                raise HTTPException(status_code=404, detail="Reviewer not found")
            active = int(await self.db.scalar(
                select(func.count(AbstractAssignment.id)).where(
                    AbstractAssignment.reviewer_id == row.id,
                    AbstractAssignment.status.in_(["ASSIGNED", "ACCEPTED"]),
                )
            ) or 0)
            if active:
                raise HTTPException(status_code=409, detail={"code": "REVIEWER_HAS_ACTIVE_ASSIGNMENTS", "count": active})
            await self._audit(event=event, user=user, action="ABSTRACT_REVIEWER_DELETED", reviewer_id=row.id,
                              old={"email": row.email}, new={})
            await self.db.delete(row)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
