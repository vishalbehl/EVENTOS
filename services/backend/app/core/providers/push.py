import httpx
import logging
from typing import Dict, Any, Optional
from app.config import settings
from .base import BasePushProvider

logger = logging.getLogger(__name__)

class FirebasePushProvider(BasePushProvider):
    def __init__(self, project_id: str = None, service_account_token: str = None):
        self.project_id = project_id or getattr(settings, "FIREBASE_PROJECT_ID", None)
        self.service_account_token = service_account_token or getattr(settings, "FIREBASE_SERVICE_ACCOUNT_TOKEN", None)

    async def send_push(self, device_token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        if not self.project_id or not self.service_account_token or settings.environment == "testing":
            logger.info(f"[MOCK PUSH] Sent to={device_token}, title={title}, body={body}...")
            return {
                "status": "success",
                "message_id": "mock-push-id",
                "provider": "mock-firebase-push",
                "raw_response": {"mocked": True}
            }

        url = f"https://fcm.googleapis.com/v1/projects/{self.project_id}/messages:send"
        headers = {
            "Authorization": f"Bearer {self.service_account_token}",
            "Content-Type": "application/json"
        }
        
        message = {
            "token": device_token,
            "notification": {
                "title": title,
                "body": body
            }
        }
        if data:
            # FCM v1 data must be flat string key-value pairs
            message["data"] = {str(k): str(v) for k, v in data.items()}

        payload = {"message": message}

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code == 200:
                    res_json = response.json()
                    return {
                        "status": "success",
                        "message_id": res_json.get("name"), # FCM v1 returns resource name (projects/*/messages/*) as ID
                        "provider": "firebase-push",
                        "raw_response": res_json
                    }
                else:
                    return {
                        "status": "failed",
                        "provider": "firebase-push",
                        "failure_reason": f"Firebase API error: {response.text}",
                        "raw_response": response.json() if response.headers.get("content-type") == "application/json" else response.text
                    }
        except Exception as e:
            logger.exception("Failed to send Push via Firebase")
            return {
                "status": "failed",
                "provider": "firebase-push",
                "failure_reason": str(e)
            }
