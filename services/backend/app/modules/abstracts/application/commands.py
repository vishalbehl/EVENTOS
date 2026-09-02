"""Transaction-owning commands for abstract configuration."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.abstracts.models import AbstractCall, AbstractForm
from app.modules.audit.services.audit_service import AuditContext, AuditService


class AbstractConfigurationCommandService:
    """Persist abstract-call and form configuration without router transactions."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _audit(self, *, event, user, action: str, resource_id, old: dict[str, Any], new: dict[str, Any]) -> None:
        await AuditService.write_log_sync(
            AuditContext(action_type=action, resource_type="abstract", resource_id=resource_id,
                         actor_user_id=user.id, organization_id=event.organization_id,
                         actor_role=getattr(user, "role", None), old_state=old,
                         new_state={**new, "event_id": str(event.id)}),
            self.db,
        )

    async def update_call(self, *, payload: dict[str, Any], event, user, expected_version: int | None):
        try:
            call = await self.db.scalar(
                select(AbstractCall).where(
                    AbstractCall.event_id == event.id,
                    AbstractCall.organization_id == event.organization_id,
                ).with_for_update()
            )
            if call is None:
                call = AbstractCall(organization_id=event.organization_id, event_id=event.id)
                self.db.add(call)
            elif expected_version and call.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": call.version})
            if payload["min_words"] > payload["max_words"]:
                raise HTTPException(status_code=422, detail={"code": "INVALID_WORD_LIMITS"})
            old = {"status": call.status, "version": call.version}
            for key, value in payload.items():
                setattr(call, key, value)
            call.version = int(call.version or 1) + 1
            if call.status == "PUBLISHED" and call.published_at is None:
                call.published_at = datetime.now(timezone.utc)
            await self.db.flush()
            await self._audit(event=event, user=user, action="ABSTRACT_CALL_UPDATED", resource_id=call.id,
                              old=old, new={"status": call.status, "version": call.version})
            await self.db.commit()
            await self.db.refresh(call)
            return call
        except Exception:
            await self.db.rollback()
            raise

    async def update_form(self, *, payload: dict[str, Any], event, user, expected_version: int | None):
        try:
            form = await self.db.scalar(
                select(AbstractForm).where(
                    AbstractForm.event_id == event.id,
                    AbstractForm.organization_id == event.organization_id,
                    AbstractForm.is_active.is_(True),
                ).order_by(AbstractForm.version.desc()).with_for_update()
            )
            if form is None:
                form = AbstractForm(organization_id=event.organization_id, event_id=event.id)
                self.db.add(form)
            elif expected_version and form.version != expected_version:
                raise HTTPException(status_code=412, detail={"code": "VERSION_CONFLICT", "current_version": form.version})
            old = {"version": form.version, "published_at": form.published_at.isoformat() if form.published_at else None}
            form.title = payload["title"]
            form.schema = payload["form_schema"]
            form.is_active = payload["is_active"]
            form.version = int(form.version or 1) + 1
            if payload["publish"]:
                form.published_at = datetime.now(timezone.utc)
            await self.db.flush()
            await self._audit(event=event, user=user, action="ABSTRACT_FORM_UPDATED", resource_id=form.id,
                              old=old, new={"version": form.version, "published": bool(form.published_at)})
            await self.db.commit()
            await self.db.refresh(form)
            return form
        except Exception:
            await self.db.rollback()
            raise
