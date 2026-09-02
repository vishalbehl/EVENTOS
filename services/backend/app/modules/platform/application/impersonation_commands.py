"""Transaction-owning privileged impersonation handoff commands."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_domain_tables import ImpersonationLog
from app.modules.audit.models.audit_log import AuditLog
from app.modules.identity.models.user import User


class ImpersonationCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_handoff(self, *, organization_id, actor, target_user_id,
                             reason: str, case_reference: str | None,
                             ip_address: str | None, user_agent: str | None) -> dict:
        try:
            target = await self.db.scalar(select(User).where(
                User.id == target_user_id,
                User.organization_id == organization_id,
                User.is_active.is_(True),
            ))
            if target is None:
                raise HTTPException(status_code=404, detail="Active organization user not found")
            raw_code = secrets.token_urlsafe(48)
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=5)
            row = ImpersonationLog(
                super_admin_id=actor.id, target_organization_id=organization_id,
                target_user_id=target.id, reason=reason, case_reference=case_reference,
                ip_address=ip_address, user_agent=user_agent,
                session_expires_at=expires_at,
                session_token_hash=hashlib.sha256(raw_code.encode()).hexdigest(),
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="impersonation_session",
                resource_id=row.id, action_type="IMPERSONATION_HANDOFF_CREATED",
                new_state={"target_user_id": str(target.id),
                           "case_reference": case_reference,
                           "expires_at": expires_at.isoformat()},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"handoff_code": raw_code, "session_id": row.id,
                    "expires_at": row.session_expires_at,
                    "target_user_id": row.target_user_id, "single_use": True}
        except Exception:
            await self.db.rollback()
            raise
