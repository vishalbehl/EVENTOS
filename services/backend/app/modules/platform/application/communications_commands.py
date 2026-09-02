"""Transaction-owning commands for platform communications administration."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.audit.models.audit_log import AuditLog
from app.modules.platform.models.maintenance_window import MaintenanceWindow
from app.modules.platform.models.platform_domain_tables import GlobalAnnouncement


class PlatformCommunicationsCommandService:
    """Keep global communication mutations out of the HTTP router."""

    def __init__(self, db: AsyncSession):
        self.db = db

    @staticmethod
    def _actor_role(user) -> str | None:
        return getattr(user, "platform_role", None) or getattr(user, "role", None)

    def _audit(self, *, user, resource_type: str, resource_id, action: str, old=None, new=None, reason: str):
        self.db.add(
            AuditLog(
                organization_id=user.organization_id,
                actor_user_id=user.id,
                resource_type=resource_type,
                resource_id=resource_id,
                action_type=action,
                actor_role=self._actor_role(user),
                old_state=old,
                new_state=new,
                change_diff={"reason": reason},
                is_sensitive=True,
            )
        )

    async def _save(self, row):
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def create_announcement(self, *, user, title: str, content: str, is_active: bool, reason: str):
        try:
            row = GlobalAnnouncement(title=title, content=content, is_active=is_active)
            self.db.add(row)
            await self.db.flush()
            self._audit(user=user, resource_type="global_announcement", resource_id=row.id,
                        action="GLOBAL_ANNOUNCEMENT_CREATED", new={"title": title, "is_active": is_active}, reason=reason)
            return await self._save(row)
        except Exception:
            await self.db.rollback()
            raise

    async def update_announcement(self, *, user, announcement_id, updates: dict, reason: str):
        try:
            row = await self.db.scalar(select(GlobalAnnouncement).where(GlobalAnnouncement.id == announcement_id).with_for_update())
            if not row:
                raise HTTPException(status_code=404, detail="Announcement not found")
            old = {"title": row.title, "content": row.content, "is_active": row.is_active}
            for key, value in updates.items():
                setattr(row, key, value)
            self._audit(user=user, resource_type="global_announcement", resource_id=row.id,
                        action="GLOBAL_ANNOUNCEMENT_UPDATED", old=old,
                        new={"title": row.title, "content": row.content, "is_active": row.is_active}, reason=reason)
            return await self._save(row)
        except Exception:
            await self.db.rollback()
            raise

    async def delete_announcement(self, *, user, announcement_id, reason: str):
        try:
            row = await self.db.scalar(select(GlobalAnnouncement).where(GlobalAnnouncement.id == announcement_id).with_for_update())
            if not row:
                raise HTTPException(status_code=404, detail="Announcement not found")
            self._audit(user=user, resource_type="global_announcement", resource_id=row.id,
                        action="GLOBAL_ANNOUNCEMENT_DELETED",
                        old={"title": row.title, "is_active": row.is_active,
                             "created_at": row.created_at.isoformat() if row.created_at else None}, reason=reason)
            await self.db.delete(row)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise

    @staticmethod
    def _status(value: str | None) -> str | None:
        if value is None:
            return value
        normalized = value.upper()
        if normalized not in {"SCHEDULED", "IN_PROGRESS", "COMPLETED", "CANCELLED"}:
            raise HTTPException(status_code=422, detail=f"Unsupported maintenance status: {value}")
        return normalized

    async def create_maintenance(self, *, user, values: dict, reason: str):
        try:
            values = {**values, "status": self._status(values.get("status")) or "SCHEDULED", "created_by": user.id}
            row = MaintenanceWindow(**values)
            self.db.add(row)
            await self.db.flush()
            self._audit(user=user, resource_type="maintenance_window", resource_id=row.id,
                        action="MAINTENANCE_WINDOW_CREATED",
                        new={"title": row.title, "status": row.status, "starts_at": row.starts_at.isoformat(), "ends_at": row.ends_at.isoformat()}, reason=reason)
            return await self._save(row)
        except Exception:
            await self.db.rollback()
            raise

    async def update_maintenance(self, *, user, window_id, updates: dict, reason: str):
        try:
            row = await self.db.scalar(select(MaintenanceWindow).where(MaintenanceWindow.id == window_id).with_for_update())
            if not row:
                raise HTTPException(status_code=404, detail="Maintenance window not found")
            if "status" in updates:
                updates["status"] = self._status(updates["status"])
            starts_at = updates.get("starts_at", row.starts_at)
            ends_at = updates.get("ends_at", row.ends_at)
            if starts_at and ends_at and ends_at <= starts_at:
                raise HTTPException(status_code=422, detail="ends_at must be after starts_at")
            old = {"title": row.title, "status": row.status, "starts_at": row.starts_at.isoformat(), "ends_at": row.ends_at.isoformat()}
            for key, value in updates.items():
                setattr(row, key, value)
            row.updated_at = datetime.now(timezone.utc)
            self._audit(user=user, resource_type="maintenance_window", resource_id=row.id,
                        action="MAINTENANCE_WINDOW_UPDATED", old=old,
                        new={"title": row.title, "status": row.status, "starts_at": row.starts_at.isoformat(), "ends_at": row.ends_at.isoformat()}, reason=reason)
            return await self._save(row)
        except Exception:
            await self.db.rollback()
            raise

    async def delete_maintenance(self, *, user, window_id, reason: str):
        try:
            row = await self.db.scalar(select(MaintenanceWindow).where(MaintenanceWindow.id == window_id).with_for_update())
            if not row:
                raise HTTPException(status_code=404, detail="Maintenance window not found")
            self._audit(user=user, resource_type="maintenance_window", resource_id=row.id,
                        action="MAINTENANCE_WINDOW_DELETED",
                        old={"title": row.title, "status": row.status,
                             "starts_at": row.starts_at.isoformat() if row.starts_at else None,
                             "ends_at": row.ends_at.isoformat() if row.ends_at else None,
                             "affected_services": row.affected_services}, reason=reason)
            await self.db.delete(row)
            await self.db.commit()
        except Exception:
            await self.db.rollback()
            raise
