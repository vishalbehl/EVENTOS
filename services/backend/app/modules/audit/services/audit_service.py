import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, asdict
from typing import Optional, Any, Dict
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.audit.models.audit_log import AuditLog

@dataclass
class AuditContext:
    action_type: str
    resource_type: str
    resource_id: uuid.UUID
    actor_user_id: Optional[uuid.UUID] = None
    organization_id: Optional[uuid.UUID] = None
    impersonated_by: Optional[uuid.UUID] = None
    actor_role: Optional[str] = None
    old_state: Optional[Dict[str, Any]] = None
    new_state: Optional[Dict[str, Any]] = None
    change_diff: Optional[Dict[str, Any]] = None
    actor_ip: Optional[str] = None
    actor_user_agent: Optional[str] = None
    geo_location: Optional[Dict[str, Any]] = None
    is_sensitive: bool = False
    request_id: Optional[uuid.UUID] = None
    correlation_id: Optional[uuid.UUID] = None
    occurred_at: Optional[datetime] = None
    retention_until: Optional[datetime] = None

    def to_dict(self) -> dict:
        data = asdict(self)
        for k, v in data.items():
            if isinstance(v, uuid.UUID):
                data[k] = str(v)
            elif isinstance(v, datetime):
                data[k] = v.isoformat()
        return data


class AuditService:
    @staticmethod
    async def write_log(ctx: AuditContext) -> None:
        """
        Dispatches a Celery background task passing the serialized context dictionary.
        If in testing mode, write synchronously to the DB to avoid transactional FK issues in background workers.
        """
        from app.config import settings
        from loguru import logger
        if settings.environment == "testing":
            try:
                await AuditService.write_log_sync(ctx)
            except Exception as e:
                # Wrap in a try-except to ensure any database logging issues during tests do not crash unrelated endpoints/test cases
                logger.warning(f"[AuditService] Failed to write test audit log synchronously: {e}")
        else:
            from app.tasks.audit_tasks import write_audit_log
            write_audit_log.delay(ctx.to_dict())

    @staticmethod
    async def write_log_sync(ctx: AuditContext, db: Optional[AsyncSession] = None) -> None:
        """
        Writes the log directly to the DB within the active session (synchronously).
        """
        log_entry = AuditLog(
            request_id=ctx.request_id,
            correlation_id=ctx.correlation_id,
            organization_id=ctx.organization_id,
            actor_user_id=ctx.actor_user_id,
            impersonated_by=ctx.impersonated_by,
            resource_type=ctx.resource_type,
            resource_id=ctx.resource_id,
            action_type=ctx.action_type,
            actor_role=ctx.actor_role,
            old_state=ctx.old_state,
            new_state=ctx.new_state,
            change_diff=ctx.change_diff,
            actor_ip=ctx.actor_ip,
            actor_user_agent=ctx.actor_user_agent,
            geo_location=ctx.geo_location,
            is_sensitive=ctx.is_sensitive,
            occurred_at=ctx.occurred_at or datetime.now(timezone.utc),
            retention_until=ctx.retention_until
        )
        if db is not None:
            db.add(log_entry)
            await db.commit()
        else:
            from app.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                session.add(log_entry)
                await session.commit()
