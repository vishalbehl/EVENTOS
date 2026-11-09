"""Database-side cohort materialisation, followed by bounded keyset hydration."""
from fastapi import HTTPException
from sqlalchemy import and_, insert, literal, select
from app.modules.communications.models.campaign_recipient_snapshot import CampaignRecipientSnapshot
from app.modules.communications.models.email_campaign import EmailCampaign
from app.modules.events.models.speaker import Speaker
from app.modules.registration.models.participant import Participant
from app.modules.notifications.services.campaign_authority import reauthorize_dispatch
from app.modules.notifications.services.campaign_recipient_counts import recipient_selection_statement

BATCH_SIZE = 50


async def prepare_campaign_snapshot(db, campaign, organization_id, dispatch_id):
    await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
    await db.refresh(campaign, with_for_update=True)
    if campaign.send_dispatch_id != dispatch_id:
        raise HTTPException(403, detail={"code": "CAMPAIGN_DISPATCH_REVOKED"})
    if campaign.recipient_snapshot_dispatch_id == dispatch_id:
        if campaign.recipient_snapshot_count is None or campaign.recipient_snapshot_target_type != campaign.target_type:
            raise HTTPException(503, detail={"code": "CAMPAIGN_SNAPSHOT_RECONCILIATION_REQUIRED"})
        return campaign.recipient_snapshot_count
    model = Participant if campaign.target_type == "participant" else Speaker
    selection = recipient_selection_statement(campaign).with_only_columns(
        literal(dispatch_id), model.id, literal(organization_id), literal(campaign.event_id),
        literal(campaign.id), model.email, maintain_column_froms=True
    ).distinct(model.email).order_by(model.email, model.id)
    # INSERT SELECT seals the whole SQL-statement cohort without hydrating it.
    # The campaign lock serialises competing snapshot builders of this generation.
    result = await db.execute(insert(CampaignRecipientSnapshot.__table__).from_select(
        ["dispatch_id", "recipient_id", "organization_id", "event_id", "campaign_id", "to_email"], selection))
    count = result.rowcount
    if count is None or count < 0:
        raise HTTPException(503, detail={"code": "CAMPAIGN_SNAPSHOT_COUNT_UNAVAILABLE"})
    campaign.recipient_snapshot_dispatch_id = dispatch_id
    campaign.recipient_snapshot_count = count
    campaign.recipient_snapshot_target_type = campaign.target_type
    campaign.total_recipients = count
    await db.flush()
    return count


async def campaign_snapshot_batch(db, campaign, organization_id, dispatch_id, after=None):
    state = await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
    if state.recipient_snapshot_dispatch_id != dispatch_id or state.recipient_snapshot_target_type != state.target_type or state.target_type != campaign.target_type:
        raise HTTPException(503, detail={"code": "CAMPAIGN_SNAPSHOT_RECONCILIATION_REQUIRED"})
    model = Participant if campaign.target_type == "participant" else Speaker
    snapshot = CampaignRecipientSnapshot
    query = select(snapshot.recipient_id, model).select_from(snapshot).outerjoin(model, and_(
        model.id == snapshot.recipient_id, model.event_id == snapshot.event_id,
        model.deleted_at.is_(None), model.email == snapshot.to_email,
    )).where(snapshot.organization_id == organization_id, snapshot.event_id == campaign.event_id,
        snapshot.campaign_id == campaign.id, snapshot.dispatch_id == dispatch_id)
    if after is not None:
        query = query.where(snapshot.recipient_id > after)
    rows = (await db.execute(query.order_by(snapshot.recipient_id).limit(BATCH_SIZE))).all()
    if any(row[1] is None for row in rows):
        # Do not silently drop removed/reassigned/address-changed identities.
        raise HTTPException(503, detail={"code": "CAMPAIGN_RECIPIENT_RECONCILIATION_REQUIRED"})
    return [row[1] for row in rows], rows[-1][0] if rows else after


async def validate_snapshot_recipient(db, campaign, organization_id, dispatch_id, recipient):
    model = Participant if campaign.target_type == "participant" else Speaker
    snapshot = CampaignRecipientSnapshot
    live = await db.scalar(select(model.id).join(snapshot, and_(
        snapshot.recipient_id == model.id, snapshot.event_id == model.event_id,
        snapshot.to_email == model.email)).where(
            model.id == recipient.id, model.deleted_at.is_(None), model.email == recipient.email,
            snapshot.organization_id == organization_id, snapshot.event_id == campaign.event_id,
            snapshot.campaign_id == campaign.id, snapshot.dispatch_id == dispatch_id,
            select(EmailCampaign.id).where(EmailCampaign.id == campaign.id,
                EmailCampaign.event_id == campaign.event_id, EmailCampaign.send_dispatch_id == dispatch_id,
                EmailCampaign.recipient_snapshot_dispatch_id == dispatch_id,
                EmailCampaign.target_type == campaign.target_type,
                EmailCampaign.recipient_snapshot_target_type == campaign.target_type,
                EmailCampaign.deleted_at.is_(None)).exists()))
    if live is None:
        raise HTTPException(503, detail={"code": "CAMPAIGN_RECIPIENT_RECONCILIATION_REQUIRED"})
