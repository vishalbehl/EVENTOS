"""Transaction-owning organization notification-channel commands."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.cache import invalidate_organization
from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.organization_console import OrganizationNotificationChannelConfig
from app.modules.notifications.services.channel_provider_service import ChannelProviderError, ChannelProviderService


class OrganizationNotificationChannelCommandService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, *, organization_id, actor, values: dict, reason: str):
        try:
            duplicate = await self.db.scalar(select(OrganizationNotificationChannelConfig.id).where(
                OrganizationNotificationChannelConfig.organization_id == organization_id,
                OrganizationNotificationChannelConfig.channel == values["channel"],
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            ))
            if duplicate:
                raise HTTPException(status_code=409, detail="An active configuration for this channel already exists")
            row = OrganizationNotificationChannelConfig(organization_id=organization_id, **values)
            self.db.add(row)
            await self.db.flush()
            audit_values = {
                **values,
                "secret_reference": "[REDACTED]" if values.get("secret_reference") else None,
                "reason": reason,
            }
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_notification_channel",
                resource_id=row.id, action_type="ORGANIZATION_NOTIFICATION_CHANNEL_CREATED",
                new_state=audit_values, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def archive(self, *, organization_id, channel_id, actor, if_match: int,
                      reason: str):
        try:
            row = await self.db.scalar(select(OrganizationNotificationChannelConfig).where(
                OrganizationNotificationChannelConfig.id == channel_id,
                OrganizationNotificationChannelConfig.organization_id == organization_id,
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Notification channel not found")
            if row.version != if_match:
                raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
            row.deleted_at = datetime.now(timezone.utc)
            row.state = "UNAVAILABLE"
            row.secret_reference = None
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_notification_channel",
                resource_id=row.id, action_type="ORGANIZATION_NOTIFICATION_CHANNEL_ARCHIVED",
                new_state={"deleted_at": row.deleted_at.isoformat(),
                           "secret_reference": "[REDACTED]", "reason": reason},
                is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def update(self, *, organization_id, channel_id, actor, values: dict,
                     if_match: int, reason: str):
        try:
            row = await self.db.scalar(select(OrganizationNotificationChannelConfig).where(
                OrganizationNotificationChannelConfig.id == channel_id,
                OrganizationNotificationChannelConfig.organization_id == organization_id,
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Notification channel not found")
            if row.version != if_match:
                raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
            old = {"channel": row.channel, "provider": row.provider,
                   "state": row.state, "version": row.version}
            changed_material = any(
                values.get(key, getattr(row, key)) != getattr(row, key)
                for key in ("channel", "provider", "configuration", "secret_reference")
            )
            for key, value in values.items():
                setattr(row, key, value)
            if changed_material:
                row.last_verified_at = None
                if row.state not in {"UNAVAILABLE", "PAUSED"}:
                    row.state = "CONFIGURED"
            row.version = int(row.version or 1) + 1
            audit_values = {**values, "version": row.version, "reason": reason}
            if "secret_reference" in audit_values:
                audit_values["secret_reference"] = "[REDACTED]" if values["secret_reference"] else None
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_notification_channel",
                resource_id=row.id, action_type="ORGANIZATION_NOTIFICATION_CHANNEL_UPDATED",
                old_state=old, new_state=audit_values, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            return row
        except Exception:
            await self.db.rollback()
            raise

    async def verify(self, *, organization_id, channel_id, actor, if_match: int,
                     reason: str, case_reference: str | None):
        # Provider I/O happens before the database lock; only the short state
        # transition is serialized and guarded by the original version.
        source = await self.db.scalar(select(OrganizationNotificationChannelConfig).where(
            OrganizationNotificationChannelConfig.id == channel_id,
            OrganizationNotificationChannelConfig.organization_id == organization_id,
            OrganizationNotificationChannelConfig.deleted_at.is_(None),
        ))
        if source is None:
            raise HTTPException(status_code=404, detail="Notification channel not found")
        if source.version != if_match:
            raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
        try:
            evidence = await ChannelProviderService.verify(source)
        except ChannelProviderError as exc:
            return await self._finish_verification(
                organization_id=organization_id, channel_id=channel_id, actor=actor,
                if_match=if_match, reason=reason, case_reference=case_reference,
                state="DEGRADED", evidence={"code": exc.code}, error=exc,
            )
        return await self._finish_verification(
            organization_id=organization_id, channel_id=channel_id, actor=actor,
            if_match=if_match, reason=reason, case_reference=case_reference,
            state="ACTIVE", evidence=evidence, error=None,
        )

    async def _finish_verification(self, *, organization_id, channel_id, actor,
                                   if_match: int, reason: str,
                                   case_reference: str | None, state: str,
                                   evidence: dict, error: Exception | None):
        try:
            row = await self.db.scalar(select(OrganizationNotificationChannelConfig).where(
                OrganizationNotificationChannelConfig.id == channel_id,
                OrganizationNotificationChannelConfig.organization_id == organization_id,
                OrganizationNotificationChannelConfig.deleted_at.is_(None),
            ).with_for_update())
            if row is None:
                raise HTTPException(status_code=404, detail="Notification channel not found")
            if row.version != if_match:
                raise HTTPException(status_code=409, detail="VERSION_CONFLICT")
            old_state = {"state": row.state, "version": row.version}
            row.state = state
            row.last_verified_at = datetime.now(timezone.utc) if state == "ACTIVE" else None
            row.version = int(row.version or 1) + 1
            self.db.add(AuditLog(
                organization_id=organization_id, actor_user_id=actor.id,
                actor_role=actor.role, resource_type="organization_notification_channel",
                resource_id=row.id,
                action_type=("ORGANIZATION_NOTIFICATION_CHANNEL_VERIFIED" if error is None else "ORGANIZATION_NOTIFICATION_CHANNEL_VERIFICATION_FAILED"),
                old_state=old_state,
                new_state={"state": state, "verification": evidence,
                           "reason": reason, "case_reference": case_reference,
                           "version": row.version}, is_sensitive=True,
            ))
            await self.db.commit()
            await self.db.refresh(row)
            await invalidate_organization(organization_id)
            if error is not None:
                raise HTTPException(status_code=503,
                                    detail={"code": error.code, "message": str(error)}) from error
            return row
        except Exception:
            await self.db.rollback()
            raise
