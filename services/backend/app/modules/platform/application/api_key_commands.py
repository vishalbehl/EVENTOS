"""Transaction-owning organization API-key commands."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.developer.models.developer_registry import ApiKey
from app.modules.developer.services.developer_service import DeveloperService


class OrganizationApiKeyCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, name: str,
                     expires_in_days: int | None, idempotency_key: str,
                     request_hash: str, case_reference: str | None,
                     reason: str) -> dict:
        try:
            existing = await self.db.scalar(select(ApiKey).where(
                ApiKey.organization_id == organization_id,
                ApiKey.idempotency_key == idempotency_key,
            ).with_for_update())
            if existing:
                if existing.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
                return {"id": existing.id, "name": existing.name, "prefix": existing.prefix,
                        "is_active": existing.is_active, "expires_at": existing.expires_at,
                        "plaintext_key": None, "secret_available": False}
            row = await DeveloperService.generate_api_key(
                self.db, organization_id, name, expires_in_days,
                idempotency_key=idempotency_key, request_hash=request_hash,
            )
            plaintext = row.plaintext_key
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="developer_api_key",
                resource_id=row.id, action_type="ORGANIZATION_API_KEY_CREATED",
                new_state={"name": row.name, "prefix": row.prefix,
                           "expires_at": row.expires_at.isoformat() if row.expires_at else None,
                           "case_reference": case_reference, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "name": row.name, "prefix": row.prefix,
                    "is_active": row.is_active, "expires_at": row.expires_at,
                    "plaintext_key": plaintext, "secret_available": True}
        except Exception:
            await self.db.rollback()
            raise

    async def revoke(self, *, organization_id, key_id, actor, reason: str) -> dict:
        try:
            row = await DeveloperService.revoke_api_key(self.db, organization_id, key_id)
            if row is None:
                raise HTTPException(status_code=404, detail="API key not found")
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="developer_api_key",
                resource_id=row.id, action_type="ORGANIZATION_API_KEY_REVOKED",
                new_state={"is_active": False, "reason": reason}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "is_active": row.is_active}
        except Exception:
            await self.db.rollback()
            raise
