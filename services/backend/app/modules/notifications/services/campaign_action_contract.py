"""Versioned campaign commands reuse the shared receipt/audit infrastructure."""
import uuid
from fastapi import HTTPException
from app.core.concurrency import require_if_match
from app.core.idempotency_service import begin_idempotent
from app.modules.audit.models.audit_log import AuditLog
from sqlalchemy import select
from app.modules.communications.models.email_campaign import EmailCampaign


async def begin_campaign_action(db, *, event, actor, campaign_id, operation, data, if_match, key):
    version = require_if_match(if_match)
    if not key or not 8 <= len(key.strip()) <= 200:
        raise HTTPException(428, detail={"code": "IDEMPOTENCY_KEY_REQUIRED"})
    owned = await db.scalar(select(EmailCampaign.id).where(
        EmailCampaign.id == campaign_id, EmailCampaign.event_id == event.id))
    if owned is None:
        raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
    receipt = await begin_idempotent(
        db, organization_id=event.organization_id, actor_id=actor.id,
        operation=f"email_campaign.{operation}.v2", key=key,
        payload={"actor_id": str(actor.id), "event_id": str(event.id),
            "campaign_id": str(campaign_id), "version": version, "reason": data.reason})
    return version, receipt


def check_campaign_version(campaign, version):
    if campaign.version != version:
        raise HTTPException(412, detail={"code": "RESOURCE_VERSION_CONFLICT"})


def audit_campaign_action(db, *, event, actor, campaign, reason, operation, previous_version):
    db.add(AuditLog(organization_id=event.organization_id, actor_user_id=actor.id,
        correlation_id=campaign.send_dispatch_id or uuid.uuid4(), resource_type="email_campaign",
        resource_id=campaign.id, action_type=f"CAMPAIGN_{operation.upper()}", is_sensitive=True,
        old_state={"version": previous_version},
        new_state={"acting_organization_id": str(event.organization_id),
            "target_organization_id": str(event.organization_id), "event_id": str(event.id),
            "reason": reason, "version": campaign.version, "status": campaign.status}))
