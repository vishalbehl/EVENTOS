"""Shared scoped admission and SQL ownership fence for communication reads."""
from fastapi import HTTPException
from sqlalchemy import exists, select

from app.database import tenant_org_id
from app.modules.events.models.event import Event
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.rbac.services.access_contexts import actor_request_context
from app.modules.rbac.services.event_scope import owned_event_scope


async def communication_read_scope(db, user_id, event_id, *, action="CAMPAIGNS:VIEW", campaign_id=None):
    organization_id = tenant_org_id.get()
    if organization_id is None or user_id is None:
        raise HTTPException(403, detail={"code": "TENANT_CONTEXT_REQUIRED"})
    async with actor_request_context(db, user_id, organization_id, event_id=event_id, action=action):
        if campaign_id is not None:
            found = await db.scalar(select(EmailCampaign.id).where(EmailCampaign.id == campaign_id,
                EmailCampaign.event_id == event_id, EmailCampaign.deleted_at.is_(None)))
            if found is None:
                raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
    # Include ownership in the business query, not just a previous lookup. The
    # shared policy lock remains held in this request's enclosing transaction.
    return exists(select(Event.id).where(Event.id == event_id,
        Event.organization_id == organization_id, Event.deleted_at.is_(None),
        owned_event_scope(db, Event.id, organization_id)))
