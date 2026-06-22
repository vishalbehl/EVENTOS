import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import select, and_, desc, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform_compliance.models import PlatformSecurityEvent

class SecurityEventService:
    """
    Service for logging security forensics, threat/anomaly detection alerts,
    and managing active security event statuses.
    """

    @staticmethod
    async def record_security_event(
        db: AsyncSession,
        organization_id: uuid.UUID,
        event_type: str,
        severity: str,
        title: str,
        description: str,
        metadata: Optional[dict] = None,
        status: str = "OPEN"
    ) -> PlatformSecurityEvent:
        """
        Logs a security anomaly/event under platform_compliance.security_events ledger.
        If severity is 'CRITICAL' or 'HIGH', triggers alerts (Slack/Email mock integrations).
        """
        event = PlatformSecurityEvent(
            id=uuid.uuid4(),
            organization_id=organization_id,
            event_type=event_type,
            severity=severity,
            title=title,
            description=description,
            metadata_data=metadata,
            status=status,
            created_at=datetime.now(timezone.utc)
        )
        db.add(event)
        await db.flush()

        if severity.upper() in ["HIGH", "CRITICAL"]:
            await SecurityEventService.create_alert(event)

        return event

    @staticmethod
    async def get_events(
        db: AsyncSession,
        organization_id: uuid.UUID,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[PlatformSecurityEvent]:
        """
        Retrieve security events with optional filters.
        """
        stmt = select(PlatformSecurityEvent).where(
            PlatformSecurityEvent.organization_id == organization_id
        )
        if severity:
            stmt = stmt.where(PlatformSecurityEvent.severity == severity.upper())
        if status:
            stmt = stmt.where(PlatformSecurityEvent.status == status.upper())

        stmt = stmt.order_by(desc(PlatformSecurityEvent.created_at)).limit(limit).offset(offset)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def mark_resolved(
        db: AsyncSession,
        event_id: uuid.UUID,
        organization_id: uuid.UUID,
        resolution_metadata: Optional[dict] = None
    ) -> Optional[PlatformSecurityEvent]:
        """
        Marks an open security event as RESOLVED.
        """
        stmt = select(PlatformSecurityEvent).where(
            and_(
                PlatformSecurityEvent.id == event_id,
                PlatformSecurityEvent.organization_id == organization_id
            )
        )
        event = (await db.execute(stmt)).scalar_one_or_none()
        if not event:
            return None

        event.status = "RESOLVED"
        if resolution_metadata:
            meta = dict(event.metadata_data or {})
            meta["resolution"] = resolution_metadata
            event.metadata_data = meta

        await db.flush()
        return event

    @staticmethod
    async def create_alert(event: PlatformSecurityEvent) -> None:
        """
        Dispatches high priority security alert to external notifications system or logs it.
        """
        # Mock external dispatch (e.g., Slack Webhook or Email Alerting)
        print(f"[SECURITY ALERT] [{event.severity}] - {event.title} - {event.description}")
