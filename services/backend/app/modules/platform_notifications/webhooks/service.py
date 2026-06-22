from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid
import hmac
import hashlib
import json
from datetime import datetime
from .models import NotificationWebhook

class WebhooksService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def register_webhook(self, org_id: uuid.UUID, name: str, url: str, secret: str, events: list[str]) -> NotificationWebhook:
        wh = NotificationWebhook(
            organization_id=org_id,
            name=name,
            url=url,
            secret=secret,
            events=events
        )
        self.db.add(wh)
        await self.db.flush()
        return wh

    async def get_active_webhooks(self, org_id: uuid.UUID) -> list[NotificationWebhook]:
        res = await self.db.execute(
            select(NotificationWebhook)
            .where(NotificationWebhook.organization_id == org_id, NotificationWebhook.is_active == True)
        )
        return list(res.scalars().all())

    def sign_payload(self, secret: str, payload: dict) -> str:
        data_str = json.dumps(payload, sort_keys=True)
        return hmac.new(secret.encode(), data_str.encode(), hashlib.sha256).hexdigest()

    async def dispatch_webhook(self, webhook: NotificationWebhook, event_key: str, payload: dict) -> dict:
        import httpx
        event_payload = {
            "event": event_key,
            "webhook_id": str(webhook.id),
            "timestamp": datetime.utcnow().isoformat(),
            "data": payload
        }
        sig = self.sign_payload(webhook.secret, event_payload)
        headers = {
            "Content-Type": "application/json",
            "X-EventX-Signature": sig,
            "X-EventX-Event": event_key
        }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(webhook.url, json=event_payload, headers=headers)
                return {
                    "status_code": response.status_code,
                    "response_body": response.text,
                    "success": 200 <= response.status_code < 300
                }
        except Exception as e:
            return {
                "error": str(e),
                "success": False
            }
