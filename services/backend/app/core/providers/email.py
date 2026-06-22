import httpx
import logging
from typing import Dict, Any
from app.config import settings
from .base import BaseEmailProvider

logger = logging.getLogger(__name__)

class ResendEmailProvider(BaseEmailProvider):
    def __init__(self, api_key: str = None, from_email: str = None):
        self.api_key = api_key or getattr(settings, "RESEND_API_KEY", None)
        self.from_email = from_email or getattr(settings, "FROM_EMAIL", "EventX <noreply@eventx.com>")

    async def send_email(self, to_email: str, subject: str, body: str, html_body: str = None) -> Dict[str, Any]:
        if not self.api_key or settings.environment == "testing":
            # Mock sending in testing / dev if no API key is provided
            logger.info(f"[MOCK EMAIL] Sent to={to_email}, subject={subject}, body={body[:100]}...")
            return {
                "status": "success",
                "message_id": "mock-email-id",
                "provider": "mock-resend",
                "raw_response": {"mocked": True}
            }

        url = "https://api.resend.com/emails"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "from": self.from_email,
            "to": [to_email],
            "subject": subject,
            "text": body,
        }
        if html_body:
            payload["html"] = html_body

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code == 200 or response.status_code == 201:
                    res_json = response.json()
                    return {
                        "status": "success",
                        "message_id": res_json.get("id"),
                        "provider": "resend",
                        "raw_response": res_json
                    }
                else:
                    return {
                        "status": "failed",
                        "provider": "resend",
                        "failure_reason": f"Resend API error: {response.text}",
                        "raw_response": response.json() if response.headers.get("content-type") == "application/json" else response.text
                    }
        except Exception as e:
            logger.exception("Failed to send email via Resend")
            return {
                "status": "failed",
                "provider": "resend",
                "failure_reason": str(e)
            }
