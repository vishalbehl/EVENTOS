"""Transaction-owning organization custom-field commands."""

from __future__ import annotations

import hashlib
import json
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationCustomField
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response


class OrganizerCustomFieldCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, values: dict, idempotency_key: str) -> OrganizationCustomField:
        try:
            request_hash = hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()
            replay = await self.db.scalar(select(OrganizationCustomField).where(
                OrganizationCustomField.organization_id == organization_id,
                OrganizationCustomField.idempotency_key == idempotency_key,
            ).with_for_update())
            if replay:
                if replay.request_hash != request_hash:
                    raise HTTPException(status_code=409, detail={"code": "IDEMPOTENCY_CONFLICT"})
                return replay
            duplicate = await self.db.scalar(select(OrganizationCustomField.id).where(
                OrganizationCustomField.organization_id == organization_id,
                OrganizationCustomField.field_key == values["field_key"],
            ))
            if duplicate:
                raise HTTPException(status_code=409, detail="A custom field with this key already exists")
            row = OrganizationCustomField(
                organization_id=organization_id, created_by=actor.id,
                idempotency_key=idempotency_key, request_hash=request_hash, **values,
            )
            self.db.add(row)
            await self.db.flush()
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_custom_field", resource_id=row.id,
                action_type="ORGANIZATION_CUSTOM_FIELD_CREATED",
                new_state={"field_key": row.field_key, "label": row.label, "field_type": row.field_type},
                is_sensitive=False,
            ))
            await self.db.commit()
            await invalidate_organization(organization_id)
            await self.db.refresh(row)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, field_id, actor, values: dict, if_match: int, idempotency_key: str | None = None) -> OrganizationCustomField:
        try:
            idem = None
            if idempotency_key:
                idem = await begin_idempotent(
                    self.db, organization_id=organization_id, actor_id=actor.id,
                    operation="organiser.organization.custom_field.update", key=idempotency_key,
                    payload={"field_id": str(field_id), "values": values, "if_match": if_match},
                )
                if replay_response(idem) is not None:
                    row = await self.db.scalar(select(OrganizationCustomField).where(
                        OrganizationCustomField.id == field_id,
                        OrganizationCustomField.organization_id == organization_id,
                    ).with_for_update())
                    if row is None:
                        raise RuntimeError("Completed custom-field idempotency resource is missing.")
                    await self.db.commit()
                    return row
            row = await self.db.scalar(select(OrganizationCustomField).where(
                OrganizationCustomField.id == field_id,
                OrganizationCustomField.organization_id == organization_id,
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Custom field not found")
            if row.version != if_match:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "VERSION_CONFLICT", "current_version": row.version,
                })
            duplicate = await self.db.scalar(select(OrganizationCustomField.id).where(
                OrganizationCustomField.organization_id == organization_id,
                OrganizationCustomField.field_key == values["field_key"],
                OrganizationCustomField.id != field_id,
            ))
            if duplicate:
                raise HTTPException(status_code=409, detail="A custom field with this key already exists")
            old = self._snapshot(row)
            for key, value in values.items():
                setattr(row, key, value)
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id, actor_role=actor.role,
                resource_type="organization_custom_field", resource_id=row.id,
                action_type="ORGANIZATION_CUSTOM_FIELD_UPDATED", old_state=old,
                new_state=self._snapshot(row), is_sensitive=False,
            ))
            if idem is not None:
                await complete_idempotent(
                    self.db, idem, response_status=200,
                    response_body=self._snapshot(row), resource_id=row.id,
                )
            await self.db.commit()
            await invalidate_organization(organization_id)
            await self.db.refresh(row)
            return row
        except Exception:
            await self.db.rollback()
            raise

    @staticmethod
    def _snapshot(row: OrganizationCustomField) -> dict:
        return {
            "id": str(row.id), "field_key": row.field_key, "label": row.label,
            "field_type": row.field_type, "required": row.required, "options": row.options,
            "is_active": row.is_active, "version": row.version,
        }
