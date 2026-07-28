from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.billing.services.capability_service import CapabilityService
from app.modules.communications.models.announcement import Announcement


async def list_active_entitled_announcements(
    db: AsyncSession,
    *,
    organization_id: uuid.UUID,
    event_id: uuid.UUID,
    audiences: list[str],
) -> list[Announcement]:
    """Return public-portal announcements only when canonically entitled.

    Announcement delivery is optional portal content. A resolver failure must
    fail closed for the capability without making the rest of the attendee or
    speaker dashboard unavailable.
    """
    try:
        capabilities = await CapabilityService.resolve_event(
            db, organization_id, event_id
        )
    except Exception:
        return []
    feature = capabilities.get("features", {}).get("FEAT_ANNOUNCEMENT_CENTER")
    if not feature or not feature.get("enabled"):
        return []

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(Announcement)
        .where(
            Announcement.event_id == event_id,
            Announcement.deleted_at.is_(None),
            Announcement.audience.in_(audiences),
            or_(Announcement.scheduled_at.is_(None), Announcement.scheduled_at <= now),
            or_(Announcement.expires_at.is_(None), Announcement.expires_at > now),
        )
        .order_by(Announcement.is_pinned.desc(), Announcement.created_at.desc())
    )
    return list(result.scalars().all())
