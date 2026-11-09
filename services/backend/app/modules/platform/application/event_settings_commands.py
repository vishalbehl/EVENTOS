"""Transaction-owning event settings commands."""

from __future__ import annotations

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.cache import invalidate_event
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.core.dependencies.feature_gate import enforce_platform_event_operation
from app.modules.audit.models.audit_log import AuditLog
from app.modules.events.models.event import Event
from app.modules.events.services.event_mutation_service import EventMutationService
from app.modules.rbac.schemas.event import EventUpdate
from app.core.tenant_context import TenantContextGuard
from app.modules.rbac.services.platform_operation_authority import authorize_platform_operation
from app.modules.rbac.models.access_foundation import OperationalWorkspace


class EventSettingsCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def update(self, *, organization_id, event_id, actor, payload: EventUpdate,
                     reason: str, case_reference: str,
                     expected_version: int | None = None,
                     idempotency_key: str | None = None) -> dict:
        if expected_version is None:
            raise HTTPException(428, detail={"code": "IF_MATCH_REQUIRED"})
        if expected_version < 1:
            raise HTTPException(400, detail={"code": "INVALID_VERSION"})
        if not idempotency_key:
            raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
        if not 8 <= len(idempotency_key.strip()) <= 200:
            raise HTTPException(400, detail={"code": "INVALID_IDEMPOTENCY_KEY"})
        reason, case_reference = reason.strip(), case_reference.strip()
        if not 12 <= len(reason) <= 2000 or not 2 <= len(case_reference) <= 160:
            raise HTTPException(422, detail={"code": "INVALID_ADMINISTRATIVE_REASON"})
        # Explicit finite platform authority; never manufacture customer membership.
        # Acquire all policy revisions in deterministic order before event locks.
        await authorize_platform_operation(self.db, actor.id, organization_id, "events.planning.manage")
        async with TenantContextGuard.scoped(self.db, organization_id):
            return await self._update_owned(organization_id=organization_id, event_id=event_id,
                actor=actor, payload=payload, reason=reason, case_reference=case_reference,
                expected_version=expected_version, idempotency_key=idempotency_key)

    async def _update_owned(self, *, organization_id, event_id, actor, payload,
                            reason, case_reference, expected_version, idempotency_key):
        try:
            # Replays also require current authority, ownership and operational state.
            await enforce_platform_event_operation(self.db, organization_id, event_id,
                "events.planning.manage", user_id=actor.id)
            workspace_id = await self.db.scalar(select(OperationalWorkspace.id).join(
                Event, (Event.operational_workspace_id == OperationalWorkspace.id)
                & (Event.organization_id == OperationalWorkspace.organization_id)
            ).where(Event.id == event_id, Event.organization_id == organization_id,
                Event.deleted_at.is_(None), OperationalWorkspace.status == "ACTIVE"))
            if workspace_id is None:
                raise HTTPException(404, detail={"code": "EVENT_NOT_FOUND"})
            receipt = await begin_idempotent(self.db, organization_id=organization_id,
                actor_id=actor.id, operation="platform.event-settings.update",
                key=idempotency_key, payload={"event_id": str(event_id),
                    "version": expected_version, "data": payload.model_dump(mode="json", exclude_unset=True),
                    "reason": reason, "case_reference": case_reference})
            replay = replay_response(receipt)
            if replay is not None:
                await self.db.commit()
                await invalidate_event(organization_id, event_id)
                return replay[1]
            event = await self.db.scalar(select(Event).options(
                selectinload(Event.portal_theme_setting)
            ).where(
                Event.id == event_id,
                Event.organization_id == organization_id,
                Event.deleted_at.is_(None),
            ).with_for_update(of=Event).execution_options(populate_existing=True))
            if event is None:
                raise HTTPException(status_code=404, detail={"code": "EVENT_NOT_FOUND"})
            if event.operational_workspace_id != workspace_id:
                raise HTTPException(409, detail={"code": "EVENT_WORKSPACE_CHANGED"})
            current_version = int(event.version or 1)
            if current_version != expected_version:
                raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT",
                    "current_version": current_version})

            event, _, changed_fields = await EventMutationService.update(
                self.db, event=event, payload=payload,
                actor_user_id=actor.id, expected_version=None,
                _audience="PLATFORM",
            )
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.platform_role, resource_type="event", resource_id=event.id,
                action_type="EVENT_SETTINGS_UPDATED",
                new_state=jsonable_encoder({"changed_fields": changed_fields, "reason": reason,
                           "case_reference": case_reference,
                           "acting_organization_id": str(actor.organization_id),
                           "workspace_id": str(workspace_id),
                           "version": event.version}),
                old_state={"version": current_version}, is_sensitive=True,
            ))
            await self.db.flush()
            result = jsonable_encoder({
                "id": event.id, "event_id": event.id,
                "updated": changed_fields, "updated_at": event.updated_at,
                "version": event.version,
            })
            await complete_idempotent(self.db, receipt, response_status=200,
                response_body=result, resource_id=event.id)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
        # Cache invalidation is not part of the committed transaction. A retry
        # after an invalidation failure replays the durable original result.
        await invalidate_event(organization_id, event_id)
        return result
