import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.platform_activity.services import ActivityService

router = APIRouter(prefix="/platform/activity", tags=["platform-activity"])


class SubscribeRequestSchema(BaseModel):
    entity_type: str
    entity_id: uuid.UUID


@router.get("/feed")
async def get_activity_feed(
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    limit: int = 50,
    offset: int = 0,
    subscribed_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id or uuid.UUID("00000000-0000-0000-0000-000000000000")
    feed_items = await ActivityService.get_feed(
        db=db,
        organization_id=org_id,
        user_id=current_user.id,
        entity_type=entity_type,
        entity_id=entity_id,
        limit=limit,
        offset=offset,
        subscribed_only=subscribed_only
    )
    return [
        {
            "id": str(item.id),
            "entity_type": item.entity_type,
            "entity_id": str(item.entity_id),
            "activity_type": item.activity_type,
            "title": item.title,
            "description": item.description,
            "icon": item.icon,
            "metadata": item.metadata_data,
            "created_at": item.created_at.isoformat()
        }
        for item in feed_items
    ]


@router.post("/subscribe")
async def subscribe_to_activity(
    req: SubscribeRequestSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    sub = await ActivityService.subscribe(
        db=db,
        user_id=current_user.id,
        entity_type=req.entity_type,
        entity_id=req.entity_id
    )
    await db.commit()
    return {
        "status": "success",
        "subscription_id": str(sub.id),
        "user_id": str(sub.user_id),
        "entity_type": sub.entity_type,
        "entity_id": str(sub.entity_id)
    }


@router.post("/unsubscribe")
async def unsubscribe_from_activity(
    req: SubscribeRequestSchema,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    unsubscribed = await ActivityService.unsubscribe(
        db=db,
        user_id=current_user.id,
        entity_type=req.entity_type,
        entity_id=req.entity_id
    )
    await db.commit()
    return {
        "status": "success" if unsubscribed else "no_action",
        "unsubscribed": unsubscribed
    }
