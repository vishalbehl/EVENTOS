"""Write-once owned provider evidence; never overwrite historical receipts."""
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from app.database import tenant_org_id
from app.modules.communications.models.campaign_attempt import CampaignAttempt, CampaignAttemptOutcome


async def begin_campaign_attempt(db, log, organization_id, dispatch_id, recipient_id):
    attempt = CampaignAttempt(id=uuid.uuid4(), organization_id=organization_id,
        event_id=log.event_id, campaign_id=log.campaign_id, dispatch_id=dispatch_id, recipient_id=recipient_id)
    db.add(attempt)
    await db.flush()
    log.current_attempt_id = attempt.id


async def require_campaign_attempt(db, log):
    organization_id = tenant_org_id.get()
    if organization_id is None or log.current_attempt_id is None:
        raise HTTPException(503, detail={"code": "CAMPAIGN_ATTEMPT_RECONCILIATION_REQUIRED"})
    row = await db.scalar(select(CampaignAttempt).where(
        CampaignAttempt.id == log.current_attempt_id, CampaignAttempt.organization_id == organization_id,
        CampaignAttempt.event_id == log.event_id, CampaignAttempt.campaign_id == log.campaign_id,
        CampaignAttempt.dispatch_id == log.send_dispatch_id,
        CampaignAttempt.recipient_id == (log.speaker_id or log.participant_id),
    ))
    if row is None:
        raise HTTPException(503, detail={"code": "CAMPAIGN_ATTEMPT_RECONCILIATION_REQUIRED"})
    return row


async def record_campaign_outcome(db, log, *, status, provider_receipt=None, diagnostic_code=None):
    attempt = await require_campaign_attempt(db, log)
    kind = "ACCEPTED" if provider_receipt else "UNCONFIRMED" if status == "delivery_unknown" else "REJECTED"
    if provider_receipt and (not isinstance(provider_receipt, str) or len(provider_receipt) > 255):
        raise HTTPException(503, detail={"code": "CAMPAIGN_PROVIDER_RECEIPT_INVALID"})
    diagnostic_code = diagnostic_code or None
    values = dict(id=uuid.uuid4(), attempt_id=attempt.id, organization_id=attempt.organization_id,
        event_id=attempt.event_id, campaign_id=attempt.campaign_id, kind=kind,
        provider_receipt=provider_receipt, diagnostic_code=(diagnostic_code or None))
    created = await db.scalar(insert(CampaignAttemptOutcome).values(**values)
        .on_conflict_do_nothing(constraint="uq_campaign_attempt_outcome").returning(CampaignAttemptOutcome.id))
    if created is None:
        previous = (await db.execute(select(CampaignAttemptOutcome.provider_receipt,
            CampaignAttemptOutcome.diagnostic_code).where(CampaignAttemptOutcome.attempt_id == attempt.id,
                CampaignAttemptOutcome.kind == kind))).one_or_none()
        if previous is None or previous.provider_receipt != provider_receipt or previous.diagnostic_code != diagnostic_code:
            raise HTTPException(409, detail={"code": "CAMPAIGN_PROVIDER_OUTCOME_CONFLICT"})
