import pytest
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError
from app.modules.notifications.models.email_campaign import EmailCampaign
from app.modules.notifications.models.email_template import EmailTemplate
from app.modules.rbac.models.event import Event
from app.modules.auth.models.user import User

@pytest.fixture
async def email_template(db: AsyncSession, event: Event) -> EmailTemplate:
    tpl = EmailTemplate(
        event_id=event.id,
        name="Test Template",
        template_type="approval",
        subject="Your presentation is approved!",
        body_html="<p>Approved!</p>",
        is_default=False
    )
    db.add(tpl)
    await db.flush()
    return tpl

@pytest.mark.asyncio
async def test_email_campaign_allowed_filters(db: AsyncSession, event: Event, email_template: EmailTemplate, organizer: User):
    allowed_filters = [
        'all', 'pending_upload', 'uploaded', 'approved', 'rejected', 'posters', 
        'specific_session', 'specific_room', 'specific_speakers', 'custom', 
        'paid', 'unpaid', 'pending', 'specific_participants', 'custom_list'
    ]

    for filter_val in allowed_filters:
        campaign = EmailCampaign(
            event_id=event.id,
            template_id=email_template.id,
            created_by=organizer.id,
            name=f"Campaign - {filter_val}",
            recipient_filter=filter_val,
            status="draft"
        )
        db.add(campaign)
        # Flush to check database constraint
        await db.flush()
        # Delete to keep it clean
        await db.delete(campaign)
        await db.flush()

@pytest.mark.asyncio
async def test_email_campaign_invalid_filter_raises_error(db: AsyncSession, event: Event, email_template: EmailTemplate, organizer: User):
    campaign = EmailCampaign(
        event_id=event.id,
        template_id=email_template.id,
        created_by=organizer.id,
        name="Campaign - Invalid",
        recipient_filter="invalid_filter_name",
        status="draft"
    )
    db.add(campaign)
    
    with pytest.raises(IntegrityError):
        await db.flush()
