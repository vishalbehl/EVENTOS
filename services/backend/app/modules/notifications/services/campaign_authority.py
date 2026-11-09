"""Persist and revalidate the actual dispatcher, never infer it from the creator."""
from datetime import datetime, timezone
import uuid

from fastapi import HTTPException
from sqlalchemy import select

from app.core.tenant_context import TenantContextGuard
from app.modules.events.models.event import Event
from app.modules.platform.models.organization import Organization
from app.modules.rbac.services.access_contexts import actor_request_context
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.audit.models.audit_log import AuditLog


async def authorize_dispatch(db, actor_id, organization_id, event_id, audience):
    if not actor_id or audience not in {"CUSTOMER", "PLATFORM"}:
        raise HTTPException(403, detail={"code": "CAMPAIGN_DISPATCH_AUTHORITY_REQUIRED"})
    if audience == "CUSTOMER":
        async with actor_request_context(db, actor_id, organization_id,
                                         event_id=event_id, action="CAMPAIGNS:SEND"):
            pass
    else:
        from app.modules.rbac.services.platform_operation_authority import authorize_platform_operation
        await authorize_platform_operation(db, actor_id, organization_id, "communications.bulk_email.send")
    async with TenantContextGuard.scoped(db, organization_id):
        owned = await db.scalar(select(Event.id).join(Organization, Organization.id == Event.organization_id).where(
            Event.id == event_id, Event.organization_id == organization_id, Event.deleted_at.is_(None),
            Organization.is_active.is_(True), Organization.suspended_at.is_(None)))
        if owned is None:
            raise HTTPException(404, detail={"code": "CAMPAIGN_UNAVAILABLE"})


async def bind_dispatch(db, campaign, actor_id, organization_id, *, audience="CUSTOMER"):
    await authorize_dispatch(db, actor_id, organization_id, campaign.event_id, audience)
    from app.modules.platform.models.organization_console import UsageReservation
    # A new generation must not overwrite delivery attribution before old quota
    # is settled, including holds that outlive their nominal expiry.
    active_reservation = await db.scalar(select(UsageReservation.id).where(
        UsageReservation.organization_id == organization_id,
        UsageReservation.event_id == campaign.event_id,
        UsageReservation.metric_key == "max_emails_per_event",
        UsageReservation.status == "RESERVED",
        UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign.id),
    ).limit(1))
    if active_reservation is not None:
        raise HTTPException(409, detail={"code": "CAMPAIGN_QUOTA_RECONCILIATION_REQUIRED"})
    campaign.send_actor_id = actor_id
    campaign.send_organization_id = organization_id
    campaign.send_audience = audience
    campaign.send_dispatch_id = uuid.uuid4()
    campaign.sent_at = None
    campaign.worker_token = None
    campaign.worker_lease_until = None
    campaign.recipient_snapshot_dispatch_id = None
    campaign.recipient_snapshot_count = None
    campaign.recipient_snapshot_target_type = None
    campaign.send_authorized_at = datetime.now(timezone.utc)
    db.add(AuditLog(organization_id=organization_id, actor_user_id=actor_id,
        correlation_id=campaign.send_dispatch_id, resource_type="email_campaign",
        resource_id=campaign.id, action_type="CAMPAIGN_DISPATCH_AUTHORIZED", is_sensitive=True,
        new_state={"acting_audience": audience, "target_organization_id": str(organization_id),
                   "event_id": str(campaign.event_id), "dispatch_id": str(campaign.send_dispatch_id)}))


async def reauthorize_dispatch(db, campaign, organization_id, dispatch_id):
    state = (await db.execute(select(EmailCampaign.send_actor_id, EmailCampaign.send_organization_id,
        EmailCampaign.send_audience, EmailCampaign.send_dispatch_id, EmailCampaign.event_id,
        EmailCampaign.target_type, EmailCampaign.recipient_snapshot_dispatch_id,
        EmailCampaign.recipient_snapshot_target_type).where(
            EmailCampaign.id == campaign.id, EmailCampaign.deleted_at.is_(None)))).first()
    if not state or not dispatch_id or state.send_dispatch_id != dispatch_id or state.send_organization_id != organization_id:
        raise HTTPException(403, detail={"code": "CAMPAIGN_DISPATCH_AUTHORITY_REQUIRED"})
    await authorize_dispatch(db, state.send_actor_id, organization_id, state.event_id, state.send_audience)
    return state
