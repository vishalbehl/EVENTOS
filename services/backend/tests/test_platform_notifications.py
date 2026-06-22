import pytest
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from tests.conftest import auth_headers
from app.modules.identity.models.user import User
from app.modules.platform_notifications.events.models import NotificationEvent
from app.modules.platform_notifications.templates.models import NotificationTemplate
from app.modules.platform_notifications.preferences.models import NotificationPreference
from app.modules.platform_notifications.queue.models import NotificationQueue
from app.modules.platform_notifications.deliveries.models import NotificationDelivery, InAppNotification
from app.modules.platform_notifications.logs.models import NotificationLog
from app.modules.platform_notifications.webhooks.models import NotificationWebhook
from app.modules.platform_notifications.digests.models import NotificationDigest

from app.modules.platform_notifications.events.service import EventsService
from app.modules.platform_notifications.templates.service import TemplatesService
from app.modules.platform_notifications.preferences.service import PreferencesService
from app.modules.platform_notifications.queue.service import QueueService
from app.modules.platform_notifications.deliveries.service import DeliveriesService
from app.modules.platform_notifications.digests.service import DigestsService
from app.modules.platform_notifications.webhooks.service import WebhooksService

@pytest.mark.asyncio
async def test_platform_notifications_engine_flow(db: AsyncSession, organization, organizer):
    # Setup services
    events_srv = EventsService(db)
    templates_srv = TemplatesService(db)
    pref_srv = PreferencesService(db)
    queue_srv = QueueService(db)
    deliv_srv = DeliveriesService(db)
    digests_srv = DigestsService(db)
    webhooks_srv = WebhooksService(db)

    # 1. Register Event
    event = await events_srv.register_event(
        event_key="ticket.purchase",
        name="Ticket Purchased",
        description="Triggered when a participant buys a ticket",
        module="registration",
        is_system=True
    )
    assert event.event_key == "ticket.purchase"
    assert event.is_system is True

    # 2. Register Template
    template = await templates_srv.create_template(
        org_id=organization.id,
        event_id=event.id,
        channel="email",
        name="Ticket Confirmation Email",
        subject="Your ticket for {{ event_name }}",
        body="Hi {{ name }}, thanks for registering! Your code is {{ ticket_code }}.",
        variables={"event_name": "string", "name": "string", "ticket_code": "string"}
    )
    assert template.name == "Ticket Confirmation Email"
    
    # Render check
    rendered_body = await templates_srv.render_template(template.body, {"name": "Alice", "ticket_code": "TX-123"})
    assert rendered_body == "Hi Alice, thanks for registering! Your code is TX-123."

    # 3. Preferences & Quiet Hours check
    # Set quiet hours to cover current UTC time
    now_utc = datetime.utcnow()
    # Mock preferences with quiet hours enabled
    pref = await pref_srv.get_user_preferences(organizer.id, event.id)
    assert pref.email_enabled is True
    
    # Configure quiet hours starting 1 hour ago to 1 hour from now
    quiet_start = (now_utc - timedelta(hours=1)).strftime("%H:%M")
    quiet_end = (now_utc + timedelta(hours=1)).strftime("%H:%M")
    
    await pref_srv.update_preferences(organizer.id, event.id, {
        "quiet_hours_enabled": True,
        "quiet_start_time": quiet_start,
        "quiet_end_time": quiet_end,
        "timezone": "UTC"
    })
    
    in_quiet = await pref_srv.is_in_quiet_hours(organizer.id, event.id, current_time_utc=now_utc)
    assert in_quiet is True

    # Disable quiet hours for subsequent testing
    await pref_srv.update_preferences(organizer.id, event.id, {
        "quiet_hours_enabled": False
    })
    in_quiet_disabled = await pref_srv.is_in_quiet_hours(organizer.id, event.id, current_time_utc=now_utc)
    assert in_quiet_disabled is False

    # 4. Queue Notification
    payload = {"event_name": "WebConf 2026", "name": organizer.first_name, "ticket_code": "T-100"}
    q_item = await queue_srv.push_to_queue(
        org_id=organization.id,
        event_id=event.id,
        recipient_id=organizer.id,
        channel="email",
        payload=payload,
        template_id=template.id,
        priority=10
    )
    assert q_item.status == "PENDING"
    assert q_item.priority == 10

    # 5. Dispatch Queue Item
    delivery = await deliv_srv.dispatch_queue_item(q_item)
    assert delivery is not None
    assert delivery.status == "SENT"
    assert q_item.status == "SENT"

    # Check that analytical log is recorded
    logs_res = await db.execute(select(NotificationLog).where(NotificationLog.notification_id == q_item.id))
    log = logs_res.scalar_one_or_none()
    assert log is not None
    assert log.channel == "email"
    assert log.status == "SENT"

    # 6. Test Channel preference blocker
    await pref_srv.update_preferences(organizer.id, event.id, {
        "email_enabled": False
    })
    q_item_blocked = await queue_srv.push_to_queue(
        org_id=organization.id,
        event_id=event.id,
        recipient_id=organizer.id,
        channel="email",
        payload=payload,
        template_id=template.id
    )
    delivery_blocked = await deliv_srv.dispatch_queue_item(q_item_blocked)
    assert delivery_blocked is None
    assert q_item_blocked.status == "CANCELLED"

    # Restore email pref
    await pref_srv.update_preferences(organizer.id, event.id, {
        "email_enabled": True
    })

    # 7. Test Webhook dispatching
    webhook = await webhooks_srv.register_webhook(
        org_id=organization.id,
        name="Slack Integration",
        url="https://hooks.slack.com/services/test",
        secret="whsec_123",
        events=["ticket.purchase"]
    )
    assert webhook.name == "Slack Integration"
    
    # Test signing payload
    sig = webhooks_srv.sign_payload("whsec_123", {"data": "test"})
    assert isinstance(sig, str)

    # 8. Test Digest Aggregation
    # Enable digests in user preference
    await pref_srv.update_preferences(organizer.id, event.id, {
        "digest_enabled": True
    })
    
    # Configure next run time to be in the past so it triggers
    digest = await digests_srv.configure_digest(
        org_id=organization.id,
        user_id=organizer.id,
        frequency="hourly",
        next_run_at=datetime.utcnow() - timedelta(minutes=1)
    )
    assert digest.frequency == "hourly"

    # Queue an item - since digest is enabled, it should go to DIGEST_PENDING
    q_digest_item = await queue_srv.push_to_queue(
        org_id=organization.id,
        event_id=event.id,
        recipient_id=organizer.id,
        channel="email",
        payload={"subject": "Digest Alert", "body": "This is a digested alert message"},
        template_id=None
    )
    await deliv_srv.dispatch_queue_item(q_digest_item)
    assert q_digest_item.status == "DIGEST_PENDING"

    # Process due digests
    due_digests = await digests_srv.get_due_digests()
    assert len(due_digests) > 0
    
    digest_sent = await digests_srv.process_digest(due_digests[0])
    assert digest_sent is True
    
    # Notification queue item should now be marked as SENT
    assert q_digest_item.status == "SENT"
