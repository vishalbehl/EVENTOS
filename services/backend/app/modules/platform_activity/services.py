import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from sqlalchemy import select, and_, desc, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.platform_activity.models import (
    UserActivityLog, ActivityFeed, ActivitySubscription
)

class ActivityService:
    """
    Service to handle user activity logging, dashboard activity feeds, and entity subscriptions.
    """

    @staticmethod
    async def log_user_activity(
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        activity_type: str,
        description: str,
        metadata: Optional[dict] = None,
        ip_address: Optional[str] = None
    ) -> UserActivityLog:
        """
        Record user-specific activity log.
        """
        log = UserActivityLog(
            id=uuid.uuid4(),
            organization_id=organization_id,
            user_id=user_id,
            activity_type=activity_type,
            description=description,
            metadata_data=metadata,
            ip_address=ip_address,
            created_at=datetime.now(timezone.utc)
        )
        db.add(log)
        await db.flush()
        return log

    @staticmethod
    async def get_user_logs(
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: uuid.UUID,
        limit: int = 50,
        offset: int = 0
    ) -> List[UserActivityLog]:
        """
        Retrieve chronological vertical user activity feed.
        """
        stmt = select(UserActivityLog).where(
            and_(
                UserActivityLog.organization_id == organization_id,
                UserActivityLog.user_id == user_id
            )
        ).order_by(desc(UserActivityLog.created_at)).limit(limit).offset(offset)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def create_activity(
        db: AsyncSession,
        organization_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID,
        activity_type: str,
        title: str,
        description: str,
        user_id: Optional[uuid.UUID] = None,
        icon: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> ActivityFeed:
        """
        Records dashboard activity and updates the timeline.
        """
        feed_item = ActivityFeed(
            id=uuid.uuid4(),
            organization_id=organization_id,
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id,
            activity_type=activity_type,
            title=title,
            description=description,
            icon=icon,
            metadata_data=metadata,
            created_at=datetime.now(timezone.utc)
        )
        db.add(feed_item)
        await db.flush()
        return feed_item

    @staticmethod
    async def get_feed(
        db: AsyncSession,
        organization_id: uuid.UUID,
        user_id: Optional[uuid.UUID] = None,
        entity_type: Optional[str] = None,
        entity_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0,
        subscribed_only: bool = False
    ) -> List[ActivityFeed]:
        """
        Resolves chronological timelines, filtering by subscriptions or general org feed.
        """
        stmt = select(ActivityFeed).where(ActivityFeed.organization_id == organization_id)

        if subscribed_only and user_id:
            sub_query = select(ActivitySubscription.entity_id).where(
                ActivitySubscription.user_id == user_id
            )
            stmt = stmt.where(ActivityFeed.entity_id.in_(sub_query))
        else:
            if entity_type:
                stmt = stmt.where(ActivityFeed.entity_type == entity_type)
            if entity_id:
                stmt = stmt.where(ActivityFeed.entity_id == entity_id)
            if user_id:
                stmt = stmt.where(ActivityFeed.user_id == user_id)

        stmt = stmt.order_by(desc(ActivityFeed.created_at)).limit(limit).offset(offset)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def subscribe(
        db: AsyncSession,
        user_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID
    ) -> ActivitySubscription:
        """
        Manages user entity follow subscriptions.
        """
        stmt = select(ActivitySubscription).where(
            and_(
                ActivitySubscription.user_id == user_id,
                ActivitySubscription.entity_type == entity_type,
                ActivitySubscription.entity_id == entity_id
            )
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()
        if existing:
            return existing

        sub = ActivitySubscription(
            id=uuid.uuid4(),
            user_id=user_id,
            entity_type=entity_type,
            entity_id=entity_id
        )
        db.add(sub)
        await db.flush()
        return sub

    @staticmethod
    async def unsubscribe(
        db: AsyncSession,
        user_id: uuid.UUID,
        entity_type: str,
        entity_id: uuid.UUID
    ) -> bool:
        """
        Unsubscribe from an entity's activity.
        """
        stmt = delete(ActivitySubscription).where(
            and_(
                ActivitySubscription.user_id == user_id,
                ActivitySubscription.entity_type == entity_type,
                ActivitySubscription.entity_id == entity_id
            )
        )
        result = await db.execute(stmt)
        return result.rowcount > 0
