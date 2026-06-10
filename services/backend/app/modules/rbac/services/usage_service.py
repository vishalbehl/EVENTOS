import uuid
from datetime import datetime, timezone
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from app.modules.analytics.models.usage import UsageEvent, OrganizationUsage, UsageSnapshot

class UsageTrackingService:
    @staticmethod
    async def log_event(db: AsyncSession, organization_id: uuid.UUID, event_type: str, quantity: int = 1) -> None:
        """
        Log a discrete usage event (e.g., API_CALL, EMAIL_SENT, POSTER_UPLOAD).
        """
        event = UsageEvent(
            organization_id=organization_id,
            event_type=event_type,
            quantity=quantity,
            timestamp=datetime.now(timezone.utc)
        )
        db.add(event)
        await db.commit()

    @staticmethod
    async def update_storage(db: AsyncSession, organization_id: uuid.UUID, bytes_added: int) -> None:
        """
        Increment (or decrement) the denormalized storage counter.
        """
        stmt = update(OrganizationUsage).where(
            OrganizationUsage.organization_id == organization_id
        ).values(
            storage_used_bytes=OrganizationUsage.storage_used_bytes + bytes_added,
            last_calculated_at=datetime.now(timezone.utc)
        )
        await db.execute(stmt)
        await db.commit()

    @staticmethod
    async def create_daily_snapshot(db: AsyncSession, organization_id: uuid.UUID) -> None:
        """
        Generate a daily snapshot of the organization's denormalized metrics.
        Typically called by a background Celery task at midnight UTC.
        """
        metric = await db.get(OrganizationUsage, organization_id)
        if not metric:
            return
            
        period_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        snapshot = await db.get(UsageSnapshot, (organization_id, period_str))
        metrics_dict = {
            "active_events": metric.active_events_count,
            "active_users": metric.active_users_count,
            "total_registrations": metric.total_registrations_count,
            "storage_bytes": metric.storage_used_bytes
        }
        
        if snapshot:
            snapshot.metrics = metrics_dict
        else:
            snapshot = UsageSnapshot(
                organization_id=organization_id,
                period=period_str,
                metrics=metrics_dict
            )
            db.add(snapshot)
            
        await db.commit()
