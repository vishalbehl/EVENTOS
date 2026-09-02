"""Transaction-owning privileged data-access session commands."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import PrivilegedAccessSession


class PrivilegedAccessCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, reason: str,
                     case_reference: str | None, field_categories: list[str],
                     duration_minutes: int) -> PrivilegedAccessSession:
        try:
            row = PrivilegedAccessSession(
                organization_id=organization_id, actor_user_id=actor.id,
                reason=reason, case_reference=case_reference,
                field_categories=field_categories,
                expires_at=datetime.now(timezone.utc) + timedelta(minutes=duration_minutes),
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="privileged_access_session",
                resource_id=row.id, action_type="PRIVILEGED_DATA_ACCESS_STARTED",
                new_state={"field_categories": row.field_categories,
                           "case_reference": row.case_reference,
                           "expires_at": row.expires_at.isoformat()},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def revoke(self, *, organization_id, session_id, actor) -> PrivilegedAccessSession:
        try:
            row = await self.db.scalar(select(PrivilegedAccessSession).where(
                PrivilegedAccessSession.id == session_id,
                PrivilegedAccessSession.organization_id == organization_id,
                PrivilegedAccessSession.actor_user_id == actor.id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Privileged access session not found")
            if row.revoked_at is None:
                row.revoked_at = datetime.now(timezone.utc)
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="privileged_access_session",
                resource_id=row.id, action_type="PRIVILEGED_DATA_ACCESS_REVOKED",
                new_state={"revoked_at": row.revoked_at.isoformat()}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise
