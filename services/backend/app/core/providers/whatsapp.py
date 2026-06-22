import httpx
import logging
from typing import Dict, Any
from app.config import settings
from .base import BaseWhatsappProvider

logger = logging.getLogger(__name__)

class TwilioWhatsappProvider(BaseWhatsappProvider):
    def __init__(self, account_sid: str = None, auth_token: str = None, from_number: str = None):
        self.account_sid = account_sid or getattr(settings, "TWILIO_ACCOUNT_SID", None)
        self.auth_token = auth_token or getattr(settings, "TWILIO_AUTH_TOKEN", None)
        self.from_number = from_number or getattr(settings, "TWILIO_WHATSAPP_FROM_NUMBER", "+14155238886")

    async def send_whatsapp(self, to_phone: str, message: str) -> Dict[str, Any]:
        if not self.account_sid or not self.auth_token or settings.environment == "testing":
            logger.info(f"[MOCK WHATSAPP] Sent to={to_phone}, msg={message[:100]}...")
            return {
                "status": "success",
                "message_id": "mock-whatsapp-id",
                "provider": "mock-twilio-whatsapp",
                "raw_response": {"mocked": True}
            }

        url = f"https://api.twilio.com/2010-04-01/Accounts/{self.account_sid}/Messages.json"
        auth = (self.account_sid, self.auth_token)
        
        # Twilio WhatsApp requires prefixing phone numbers with "whatsapp:"
        to_phone_whatsapp = f"whatsapp:{to_phone}" if not to_phone.startswith("whatsapp:") else to_phone
        from_number_whatsapp = f"whatsapp:{self.from_number}" if not self.from_number.startswith("whatsapp:") else self.from_number
        
        data = {
            "To": to_phone_whatsapp,
            "From": from_number_whatsapp,
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
                        "provider": "twilio-whatsapp",
                        "raw_response": res_json
                    }
                else:
                    return {
                        "status": "failed",
                        "provider": "twilio-whatsapp",
                        "failure_reason": f"Twilio API error: {response.text}",
                        "raw_response": response.json() if response.headers.get("content-type") == "application/json" else response.text
                    }
        except Exception as e:
            logger.exception("Failed to send WhatsApp via Twilio")
            return {
                "status": "failed",
                "provider": "twilio-whatsapp",
                "failure_reason": str(e)
            }
