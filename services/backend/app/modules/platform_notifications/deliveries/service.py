from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import logging
from datetime import datetime, timedelta
from .models import NotificationDelivery, InAppNotification, NotificationAttachment
from app.modules.platform_notifications.queue.models import NotificationQueue
from app.modules.platform_notifications.preferences.service import PreferencesService
from app.modules.platform_notifications.templates.service import TemplatesService
from app.modules.platform_notifications.webhooks.service import WebhooksService
from app.modules.platform_notifications.logs.models import NotificationLog
from app.modules.identity.models.user import User
from app.modules.platform_notifications.events.models import NotificationEvent
from app.core.providers import (
    ResendEmailProvider,
    TwilioSMSProvider,
    TwilioWhatsappProvider,
    FirebasePushProvider
)

logger = logging.getLogger(__name__)

class DeliveriesService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def record_delivery(self, queue_id: uuid.UUID, provider: str, status: str, provider_message_id: str = None, failure_reason: str = None) -> NotificationDelivery:
        deliv = NotificationDelivery(
            queue_id=queue_id,
            provider=provider,
            status=status,
            provider_message_id=provider_message_id,
            failure_reason=failure_reason,
            sent_at=datetime.utcnow()
        )
        self.db.add(deliv)
        await self.db.flush()
        return deliv

    async def send_in_app(self, org_id: uuid.UUID, user_id: uuid.UUID, title: str, message: str, type: str = "INFO", action_url: str = None) -> InAppNotification:
        notif = InAppNotification(
            organization_id=org_id,
            user_id=user_id,
            title=title,
            message=message,
            type=type,
            action_url=action_url,
            is_read=False
        )
        self.db.add(notif)
        await self.db.flush()
        return notif

    async def get_user_in_app(self, user_id: uuid.UUID) -> list[InAppNotification]:
        res = await self.db.execute(
            select(InAppNotification)
            .where(InAppNotification.user_id == user_id)
            .order_by(InAppNotification.created_at.desc())
        )
        return list(res.scalars().all())

    async def dispatch_queue_item(self, q_item: NotificationQueue) -> Optional[NotificationDelivery]:
        # 1. Check user preference and quiet hours
        pref_srv = PreferencesService(self.db)
        in_quiet_hours = await pref_srv.is_in_quiet_hours(q_item.recipient_id, q_item.notification_event_id)
        if in_quiet_hours:
            # Reschedule for later (1 hour)
            q_item.scheduled_at = datetime.utcnow() + timedelta(hours=1)
            q_item.status = "PENDING"
            await self.db.flush()
            return None

        pref = await pref_srv.get_user_preferences(q_item.recipient_id, q_item.notification_event_id)
        
        # Check if channel is enabled
        channel = q_item.channel.lower()
        channel_enabled = True
        if channel == "email" and not pref.email_enabled:
            channel_enabled = False
        elif channel == "sms" and not pref.sms_enabled:
            channel_enabled = False
        elif channel == "push" and not pref.push_enabled:
            channel_enabled = False
        elif channel == "whatsapp" and not pref.whatsapp_enabled:
            channel_enabled = False
        elif channel == "in_app" and not pref.in_app_enabled:
            channel_enabled = False

        if not channel_enabled:
            q_item.status = "CANCELLED"
            await self.db.flush()
            return None

        if pref.digest_enabled and channel in ("email", "sms", "push", "whatsapp"):
            q_item.status = "DIGEST_PENDING"
            await self.db.flush()
            return None

        # 2. Get recipient details
        user_res = await self.db.execute(select(User).where(User.id == q_item.recipient_id))
        user = user_res.scalar_one_or_none()
        if not user:
            q_item.status = "FAILED"
            await self.db.flush()
            return None

        # 3. Compile template
        templates_srv = TemplatesService(self.db)
        template = None
        if q_item.template_id:
            template = await templates_srv.get_template(q_item.template_id)

        if template:
            subject = await templates_srv.render_template(template.subject, q_item.payload or {})
            body = await templates_srv.render_template(template.body, q_item.payload or {})
        else:
            subject = q_item.payload.get("subject", "Notification") if q_item.payload else "Notification"
            body = q_item.payload.get("body", "") if q_item.payload else ""

        # 4. Dispatch using corresponding provider
        result = None
        provider_name = ""
        provider_msg_id = None
        failure_reason = None

        if channel == "email":
            provider_name = "resend"
            provider = ResendEmailProvider()
            result = await provider.send_email(
                to_email=user.email,
                subject=subject,
                body=body,
                html_body=q_item.payload.get("html_body") if q_item.payload else None
            )
        elif channel == "sms":
            provider_name = "twilio-sms"
            provider = TwilioSMSProvider()
            result = await provider.send_sms(to_phone=user.phone_number, message=body)
        elif channel == "whatsapp":
            provider_name = "twilio-whatsapp"
            provider = TwilioWhatsappProvider()
            result = await provider.send_whatsapp(to_phone=user.phone_number, message=body)
        elif channel == "push":
            provider_name = "firebase-push"
            provider = FirebasePushProvider()
            device_token = pref.timezone # placeholder or resolve from device tokens table if needed
            result = await provider.send_push(device_token=device_token, title=subject, body=body)
        elif channel == "in_app":
            provider_name = "in-app"
            in_app_notif = await self.send_in_app(
                org_id=q_item.organization_id,
                user_id=q_item.recipient_id,
                title=subject,
                message=body,
                type=q_item.payload.get("type", "INFO") if q_item.payload else "INFO",
                action_url=q_item.payload.get("action_url") if q_item.payload else None
            )
            result = {"status": "success", "message_id": str(in_app_notif.id)}

        # 5. Record result
        if result and result.get("status") == "success":
            q_item.status = "SENT"
            provider_msg_id = result.get("message_id")
            delivery_status = "SENT"
        else:
            q_item.status = "FAILED"
            q_item.retry_count += 1
            if q_item.retry_count < 3: # Retry limit
                q_item.status = "PENDING"
                q_item.scheduled_at = datetime.utcnow() + timedelta(minutes=5 * q_item.retry_count)
            failure_reason = result.get("failure_reason") if result else "Unknown error"
            delivery_status = "FAILED"

        # Record Delivery
        delivery = await self.record_delivery(
            queue_id=q_item.id,
            provider=provider_name,
            status=delivery_status,
            provider_message_id=provider_msg_id,
            failure_reason=failure_reason
        )

        # Record Analytical Log
        log_entry = NotificationLog(
            notification_id=q_item.id,
            channel=q_item.channel,
            status=delivery_status,
            provider=provider_name,
            payload=q_item.payload,
            response=result
        )
        self.db.add(log_entry)

        # 6. Trigger active Webhooks for this event
        event_res = await self.db.execute(select(NotificationEvent).where(NotificationEvent.id == q_item.notification_event_id))
        event = event_res.scalar_one_or_none()
        if event:
            webhooks_srv = WebhooksService(self.db)
            active_whs = await webhooks_srv.get_active_webhooks(q_item.organization_id)
            for wh in active_whs:
                if event.event_key in wh.events:
                    await webhooks_srv.dispatch_webhook(webhook=wh, event_key=event.event_key, payload=q_item.payload)

        await self.db.flush()
        return delivery
