"""PostgreSQL-clock leases: identity fencing, not an exactly-once provider claim."""
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import func, select, update

from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.events.models.event import Event
from app.modules.audit.models.audit_log import AuditLog

LEASE_DURATION = timedelta(minutes=5)


def _owned(organization_id):
    return select(Event.id).where(Event.id == EmailCampaign.event_id,
        Event.organization_id == organization_id, Event.deleted_at.is_(None)).exists()


async def acquire_worker_lease(db, campaign, organization_id, dispatch_id, worker_token):
    from app.core.tenant_job_capacity import renew_job_slot
    await renew_job_slot(organization_id, "email_campaign")
    if worker_token is None:
        raise HTTPException(403, detail={"code": "CAMPAIGN_WORKER_IDENTITY_REQUIRED"})
    row = await db.scalar(select(EmailCampaign).where(EmailCampaign.id == campaign.id,
        EmailCampaign.send_dispatch_id == dispatch_id,
        EmailCampaign.send_organization_id == organization_id, _owned(organization_id),
        EmailCampaign.deleted_at.is_(None)).with_for_update().execution_options(populate_existing=True))
    if row is None:
        raise HTTPException(403, detail={"code": "CAMPAIGN_DISPATCH_REVOKED"})
    now = await db.scalar(select(func.clock_timestamp()))
    if row.worker_token not in {None, worker_token} and row.worker_lease_until > now:
        return False
    previous_token = row.worker_token
    row.worker_token = worker_token
    row.worker_lease_until = now + LEASE_DURATION
    if previous_token != worker_token:
        db.add(AuditLog(organization_id=organization_id, actor_user_id=row.send_actor_id,
            correlation_id=dispatch_id, resource_type="email_campaign", resource_id=row.id,
            action_type="CAMPAIGN_WORKER_CLAIMED", is_sensitive=True,
            new_state={"event_id": str(row.event_id), "dispatch_id": str(dispatch_id),
                       "worker_token": str(worker_token), "recovered_expired_claim": previous_token is not None}))
    await db.flush()
    return True


async def renew_worker_lease(db, campaign, organization_id, dispatch_id, worker_token):
    from app.core.tenant_job_capacity import renew_job_slot
    await renew_job_slot(organization_id, "email_campaign")
    result = await db.execute(update(EmailCampaign).where(
        EmailCampaign.id == campaign.id, EmailCampaign.send_dispatch_id == dispatch_id,
        EmailCampaign.send_organization_id == organization_id, _owned(organization_id),
        EmailCampaign.worker_token == worker_token,
        EmailCampaign.worker_lease_until > func.clock_timestamp(),
        EmailCampaign.deleted_at.is_(None),
    ).values(worker_lease_until=func.clock_timestamp() + LEASE_DURATION)
      .execution_options(synchronize_session=False))
    if result.rowcount != 1:
        raise HTTPException(403, detail={"code": "CAMPAIGN_WORKER_LEASE_LOST"})


async def release_worker_lease(db, campaign_id, organization_id, dispatch_id, worker_token):
    if worker_token is None:
        return
    await db.execute(update(EmailCampaign).where(
        EmailCampaign.id == campaign_id, EmailCampaign.send_dispatch_id == dispatch_id,
        EmailCampaign.send_organization_id == organization_id, _owned(organization_id),
        EmailCampaign.worker_token == worker_token,
    ).values(worker_token=None, worker_lease_until=None).execution_options(synchronize_session=False))
