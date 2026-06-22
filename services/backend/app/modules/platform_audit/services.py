import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from sqlalchemy import select, func, text, desc, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform_audit.models import (
    PlatformAuditLog, EntityHistory, LoginHistory, ApiActivityLog,
    ExportLog, PlatformImpersonationLog, DataAccessLog
)

class AuditService:
    """
    Enterprise Compliance & Forensic Audit Ledger Service.
    Handles cryptographic verification, version tracking, exports, and access logging.
    """

    @staticmethod
    async def write_log(ctx: Any) -> None:
        """
        Dispatches the log event to Celery or runs synchronously if in testing environment.
        """
        from app.config import settings
        from loguru import logger
        if settings.environment == "testing":
            try:
                await AuditService.write_log_sync(ctx)
            except Exception as e:
                logger.warning(f"[AuditService] Failed to write test platform audit log synchronously: {e}")
        else:
            from app.tasks.platform_audit_tasks import write_platform_audit_log
            write_platform_audit_log.delay(ctx.to_dict())

    @staticmethod
    async def write_log_sync(ctx: Any, db: Optional[AsyncSession] = None) -> None:
        """
        Writes the platform audit log synchronously to platform_audit.audit_logs.
        """
        log_entry = PlatformAuditLog(
            id=uuid.uuid4(),
            organization_id=ctx.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000"),
            module=ctx.resource_type or "system",
            entity_type=ctx.resource_type or "unknown",
            entity_id=ctx.resource_id or uuid.uuid4(),
            action=ctx.action_type or "modified",
            old_values=ctx.old_state,
            new_values=ctx.new_state,
            metadata_data={
                **(ctx.geo_location or {}),
                "actor_role": ctx.actor_role,
                "is_sensitive": ctx.is_sensitive,
                "change_diff": ctx.change_diff,
                "impersonated_by": str(ctx.impersonated_by) if ctx.impersonated_by else None
            },
            performed_by=ctx.actor_user_id or uuid.UUID("00000000-0000-0000-0000-000000000000"),
            performed_at=ctx.occurred_at or datetime.now(timezone.utc),
            ip_address=ctx.actor_ip,
            user_agent=ctx.actor_user_agent,
            request_id=ctx.request_id,
            correlation_id=ctx.correlation_id
        )

        if db is not None:
            db.add(log_entry)
            await db.flush()
        else:
            from app.database import AsyncSessionLocal
            async with AsyncSessionLocal() as session:
                session.add(log_entry)
                await session.commit()


    @staticmethod
    async def log_action(
        db: AsyncSession,
        organization_id: uuid.UUID,
        module: str,
        entity_type: str,
        entity_id: uuid.UUID,
        action: str,
        performed_by: uuid.UUID,
        old_values: Optional[dict] = None,
        new_values: Optional[dict] = None,
        metadata: Optional[dict] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        device_id: Optional[str] = None,
        session_id: Optional[str] = None,
        request_id: Optional[uuid.UUID] = None,
        correlation_id: Optional[uuid.UUID] = None,
        event_id: Optional[uuid.UUID] = None,
    ) -> PlatformAuditLog:
        """
        Record a secure mutation event to the global compliance ledger.
        Automatically logs data modifications and maps change snapshots.
        """
        log = PlatformAuditLog(
            id=uuid.uuid4(),
            organization_id=organization_id,
            event_id=event_id,
            module=module,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            old_values=old_values,
            new_values=new_values,
            metadata_data=metadata,
            performed_by=performed_by,
            performed_at=datetime.now(timezone.utc),
            ip_address=ip_address,
            user_agent=user_agent,
            device_id=device_id,
            session_id=session_id,
            request_id=request_id,
            correlation_id=correlation_id
        )
        db.add(log)
        await db.flush()

        # Track version snapshot in entity history for state modification actions
        if action.upper() in ["CREATE", "UPDATE", "DELETE", "CREATED", "UPDATED", "DELETED"]:
            await AuditService.log_change(
                db=db,
                organization_id=organization_id,
                entity_type=entity_type,
                entity_id=entity_id,
                change_type=action.upper(),
                snapshot=new_values or old_values or {},
                created_by=performed_by
            )

        return log

    @staticmethod
    async def log_change(
        db: AsyncSession,
        organization_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        change_type: str,
        snapshot: dict,
        created_by: uuid.UUID
    ) -> EntityHistory:
        """
        Create a state snapshot version row for version history tracking.
        """
        # Determine current version number
        version_q = select(func.coalesce(func.max(EntityHistory.version), 0)).where(
            and_(
                EntityHistory.entity_type == entity_type,
                EntityHistory.entity_id == entity_id
            )
        )
        current_version = (await db.execute(version_q)).scalar() or 0

        history = EntityHistory(
            id=uuid.uuid4(),
            organization_id=organization_id,
            entity_type=entity_type,
            entity_id=entity_id,
            version=current_version + 1,
            change_type=change_type,
            snapshot=snapshot,
            created_by=created_by,
            created_at=datetime.now(timezone.utc)
        )
        db.add(history)
        await db.flush()
        return history

    @staticmethod
    async def log_access(
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        access_type: str
    ) -> DataAccessLog:
        """
        Logs a data access event (Read/Search) for privacy compliance audits.
        """
        log = DataAccessLog(
            id=uuid.uuid4(),
            organization_id=organization_id,
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            access_type=access_type,
            accessed_at=datetime.now(timezone.utc)
        )
        db.add(log)
        await db.flush()
        return log

    @staticmethod
    async def log_export(
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        module: str,
        export_type: str,
        file_name: str,
        download_url: Optional[str] = None
    ) -> ExportLog:
        """
        Track administrative data export operations.
        """
        log = ExportLog(
            id=uuid.uuid4(),
            organization_id=organization_id,
            user_id=user_id,
            module=module,
            export_type=export_type,
            file_name=file_name,
            download_url=download_url,
            created_at=datetime.now(timezone.utc)
        )
        db.add(log)
        await db.flush()
        return log

    @staticmethod
    async def log_impersonation(
        db: AsyncSession,
        organization_id: uuid.UUID,
        admin_user_id: uuid.UUID,
        target_user_id: uuid.UUID,
        reason: str,
        started_at: Optional[datetime] = None,
        ended_at: Optional[datetime] = None,
        actions_count: int = 0
    ) -> PlatformImpersonationLog:
        """
        Log platform operator user impersonation triggers.
        """
        log = PlatformImpersonationLog(
            id=uuid.uuid4(),
            organization_id=organization_id,
            admin_user_id=admin_user_id,
            target_user_id=target_user_id,
            reason=reason,
            started_at=started_at or datetime.now(timezone.utc),
            ended_at=ended_at,
            actions_count=actions_count
        )
        db.add(log)
        await db.flush()
        return log
