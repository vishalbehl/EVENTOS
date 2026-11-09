"""Settle a generation from recorded acceptance; uncertain outcomes retain capacity."""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select

from app.modules.audit.models.audit_log import AuditLog
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.communications.models.email_log import EmailLog
from app.modules.communications.models.campaign_attempt import CampaignAttempt, CampaignAttemptOutcome
from app.modules.events.models.event import Event
from app.modules.platform.models.organization_console import UsageReservation
from app.modules.platform.services.metering_service import MeteringService


async def settle_campaign_reservation(db, *, campaign, organization_id, dispatch_id, reservation):
    # Deterministic campaign -> reservation lock order, also used by claims and retries.
    current = await db.scalar(select(EmailCampaign).join(Event, Event.id == EmailCampaign.event_id).where(
        EmailCampaign.id == campaign.id, Event.organization_id == organization_id,
        EmailCampaign.event_id == campaign.event_id,
        EmailCampaign.send_dispatch_id == dispatch_id,
        EmailCampaign.send_organization_id == organization_id,
    ).with_for_update(of=EmailCampaign).execution_options(populate_existing=True))
    if current is None:
        raise HTTPException(409, detail={"code": "CAMPAIGN_SETTLEMENT_CONTEXT_CHANGED"})
    row = await db.scalar(select(UsageReservation).where(
        UsageReservation.id == reservation.id, UsageReservation.organization_id == organization_id,
        UsageReservation.event_id == campaign.event_id,
        UsageReservation.metric_key == "max_emails_per_event",
        UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign.id),
        UsageReservation.metadata_json["dispatch_id"].as_string() == str(dispatch_id),
    ).with_for_update().execution_options(populate_existing=True))
    if row is None:
        raise HTTPException(503, detail={"code": "CAMPAIGN_RESERVATION_RECONCILIATION_REQUIRED"})
    if row.status in {"CONSUMED", "RELEASED"}:
        return not bool((row.metadata_json or {}).get("reconciliation_required"))
    if row.status != "RESERVED":
        raise HTTPException(503, detail={"code": "CAMPAIGN_RESERVATION_RECONCILIATION_REQUIRED"})
    accepted = select(CampaignAttemptOutcome.id).where(
        CampaignAttemptOutcome.attempt_id == CampaignAttempt.id,
        CampaignAttemptOutcome.organization_id == organization_id,
        CampaignAttemptOutcome.event_id == campaign.event_id,
        CampaignAttemptOutcome.campaign_id == campaign.id,
        CampaignAttemptOutcome.kind == "ACCEPTED",
    ).exists()
    rejected = select(CampaignAttemptOutcome.id).where(
        CampaignAttemptOutcome.attempt_id == CampaignAttempt.id,
        CampaignAttemptOutcome.organization_id == organization_id,
        CampaignAttemptOutcome.event_id == campaign.event_id,
        CampaignAttemptOutcome.campaign_id == campaign.id,
        CampaignAttemptOutcome.kind == "REJECTED",
    ).exists()
    counts = (await db.execute(select(
        func.count().filter(accepted).label("accepted"),
        func.count().filter(and_(~accepted, ~rejected)).label("unknown"),
    ).where(CampaignAttempt.organization_id == organization_id,
        CampaignAttempt.event_id == campaign.event_id, CampaignAttempt.campaign_id == campaign.id,
        CampaignAttempt.dispatch_id == dispatch_id))).one()
    # Legacy execution evidence cannot be attributed to an invented attempt.
    legacy_unknown = int(await db.scalar(select(func.count(EmailLog.id)).where(
        EmailLog.campaign_id == campaign.id, EmailLog.event_id == campaign.event_id,
        EmailLog.current_attempt_id.is_(None),
        or_(and_(EmailLog.send_dispatch_id == dispatch_id, EmailLog.provider_message_id.is_not(None)),
            and_(or_(EmailLog.send_dispatch_id == dispatch_id, EmailLog.send_dispatch_id.is_(None)),
                 EmailLog.status.in_(("sending", "delivery_unknown")))),
    )) or 0)
    unknown_count = counts.unknown + legacy_unknown
    if counts.accepted > row.quantity:
        raise HTTPException(503, detail={"code": "CAMPAIGN_RESERVATION_RECONCILIATION_REQUIRED"})
    metadata = {**(row.metadata_json or {}), "accepted_quantity": counts.accepted,
                "unconfirmed_quantity": unknown_count, "reconciliation_required": bool(unknown_count),
                "delivery_hold": bool(unknown_count)}
    previous_metadata = dict(row.metadata_json or {})
    row.metadata_json = metadata
    if unknown_count:
        # Expiry is not proof of non-delivery. Capacity queries honour this hold.
        if previous_metadata != metadata:
            db.add(AuditLog(organization_id=organization_id, actor_user_id=current.send_actor_id,
                correlation_id=dispatch_id, resource_type="usage_reservation", resource_id=row.id,
                action_type="CAMPAIGN_QUOTA_RECONCILIATION_REQUIRED", is_sensitive=True,
                new_state={"event_id": str(campaign.event_id), "campaign_id": str(campaign.id),
                           "accepted_quantity": counts.accepted, "unconfirmed_quantity": unknown_count,
                           "held_quantity": row.quantity}))
        await db.flush()
        return False
    if counts.accepted:
        ledger, _ = await MeteringService.record(db, organization_id=organization_id,
            event_id=campaign.event_id, metric_key="emails_sent", quantity=counts.accepted,
            unit="count", source="communications.email_campaign",
            idempotency_key=f"reservation:{row.id}", actor_user_id=current.send_actor_id,
            metadata={**metadata, "reservation_id": str(row.id), "dispatch_id": str(dispatch_id),
                      "campaign_id": str(campaign.id), "reserved_quantity": row.quantity})
        row.status = "CONSUMED"
        row.consumed_entry_id = ledger.id
    else:
        row.status = "RELEASED"
        row.released_at = datetime.now(timezone.utc)
    db.add(AuditLog(organization_id=organization_id, actor_user_id=current.send_actor_id,
        correlation_id=dispatch_id, resource_type="usage_reservation", resource_id=row.id,
        action_type="CAMPAIGN_QUOTA_SETTLED", is_sensitive=True,
        new_state={"event_id": str(campaign.event_id), "campaign_id": str(campaign.id),
                   "accepted_quantity": counts.accepted, "released_quantity": row.quantity - counts.accepted,
                   "state": row.status}))
    await db.flush()
    return True
