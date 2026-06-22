import httpx
import logging
from typing import Dict, Any
from app.config import settings
from .base import BaseSMSProvider

logger = logging.getLogger(__name__)

class TwilioSMSProvider(BaseSMSProvider):
    def __init__(self, account_sid: str = None, auth_token: str = None, from_number: str = None):
        self.account_sid = account_sid or getattr(settings, "TWILIO_ACCOUNT_SID", None)
        self.auth_token = auth_token or getattr(settings, "TWILIO_AUTH_TOKEN", None)
        self.from_number = from_number or getattr(settings, "TWILIO_FROM_NUMBER", "+1234567890")

    async def send_sms(self, to_phone: str, message: str) -> Dict[str, Any]:
        if not self.account_sid or not self.auth_token or settings.environment == "testing":
            logger.info(f"[MOCK SMS] Sent to={to_phone}, msg={message[:100]}...")
            return {
                "status": "success",
                "message_id": "mock-sms-id",
                "provider": "mock-twilio-sms",
                "raw_response": {"mocked": True}
            }

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        auth = (self.account_sid, self.auth_token)
        data = {
            "To": to_phone,
            "From": self.from_number,
            "Body": message
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, data=data, auth=auth)
                if response.status_code in (200, 201):
                    res_json = response.json()
                    return {
                        "status": "success",
                        "message_id": res_json.get("sid"),
                        "provider": "twilio-sms",
                        "raw_response": res_json
                    }
                else:
                    return {
                        "status": "failed",
                        "provider": "twilio-sms",
                        "failure_reason": f"Twilio API error: {response.text}",
                        "raw_response": response.json() if response.headers.get("content-type") == "application/json" else response.text
                    }
        except Exception as e:
            logger.exception("Failed to send SMS via Twilio")
            return {
                "status": "failed",
                "provider": "twilio-sms",
                "failure_reason": str(e)
            }
