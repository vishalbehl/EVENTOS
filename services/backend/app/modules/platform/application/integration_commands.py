"""Transaction-owning organization integration commands."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.core.dependencies.feature_gate import enforce_org_operation
from app.modules.audit.models.audit_log import AuditLog
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.integrations.models.integrations_domain_tables import IntegrationConnection, IntegrationProvider


class IntegrationConnectionCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, provider_id, idempotency_key: str,
                     request_hash: str, case_reference: str | None, reason: str) -> dict:
        try:
            await enforce_org_operation(self.db, organization_id, "integrations.manage", user_id=actor.id)
            existing = await self.db.scalar(select(IntegrationConnection).where(
                IntegrationConnection.organization_id == organization_id,
                IntegrationConnection.idempotency_key == idempotency_key,
            ).with_for_update())
            if existing:
                if existing.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail="IDEMPOTENCY_CONFLICT")
                return {"id": existing.id, "provider_id": existing.provider_id,
                        "is_active": existing.is_active, "version": existing.version}
            provider = await self.db.get(IntegrationProvider, provider_id)
            if provider is None:
                raise HTTPException(status_code=404, detail="Global integration provider not found")
            duplicate = await self.db.scalar(select(IntegrationConnection.id).where(
                IntegrationConnection.organization_id == organization_id,
                IntegrationConnection.provider_id == provider_id,
            ))
            if duplicate:
                raise HTTPException(status_code=409, detail="This organization already has a connection for the provider")
            reservation = await UsageReservationService.reserve(
                self.db, organization_id=organization_id, event_id=None,
                limit_key="max_integrations", quantity=1, unit="integration",
                idempotency_key=f"integration:{idempotency_key}",
                metadata={"provider_id": str(provider_id)},
            )
            row = IntegrationConnection(
                organization_id=organization_id, provider_id=provider_id,
                is_active=True, version=1, idempotency_key=idempotency_key,
                request_hash=request_hash,
            )
            self.db.add(row)
            await self.db.flush()
            await UsageReservationService.consume(
                self.db, reservation.id, source="integrations.connection.create",
                actor_user_id=actor.id,
            )
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="integration_connection",
                resource_id=row.id, action_type="ORGANIZATION_INTEGRATION_CONNECTED",
                new_state={"provider_id": str(row.provider_id), "provider_name": provider.name,
                           "case_reference": case_reference, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "provider_id": row.provider_id,
                    "provider_name": provider.name, "is_active": row.is_active,
                    "version": row.version}
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, connection_id, actor,
                     is_active: bool, if_match: int, case_reference: str | None,
                     reason: str) -> dict:
        try:
            row = await self.db.scalar(select(IntegrationConnection).where(
                IntegrationConnection.id == connection_id,
                IntegrationConnection.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Integration connection not found")
            if row.version != if_match:
                raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
            old = row.is_active
            if is_active and not old:
                await enforce_org_operation(self.db, organization_id, "integrations.manage", user_id=actor.id)
                reservation = await UsageReservationService.reserve(
                    self.db, organization_id=organization_id, event_id=None,
                    limit_key="max_integrations", quantity=1, unit="integration",
                    idempotency_key=f"integration-reactivate:{row.id}:v{if_match}",
                    metadata={"connection_id": str(row.id)},
                )
                await UsageReservationService.consume(
                    self.db, reservation.id, source="integrations.connection.reactivate",
                    actor_user_id=actor.id,
                )
            row.is_active = is_active
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="integration_connection",
                resource_id=row.id, action_type="ORGANIZATION_INTEGRATION_STATUS_CHANGED",
                old_state={"is_active": old, "version": if_match},
                new_state={"is_active": row.is_active, "version": row.version,
                           "case_reference": case_reference, "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return {"id": row.id, "is_active": row.is_active, "version": row.version}
        except Exception:
            await self.db.rollback()
            raise
