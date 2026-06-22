from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class BaseProvider(ABC):
    @abstractmethod
    async def send(self, recipient: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Send a notification via the provider.
        Returns a dictionary containing delivery status, message ID, and provider response.
        """
        pass

class BaseEmailProvider(BaseProvider):
    @abstractmethod
    async def send_email(self, to_email: str, subject: str, body: str, html_body: str = None) -> Dict[str, Any]:
        pass

    async def send(self, recipient: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        subject = payload.get("subject", "Notification")
        body = payload.get("body", "")
        html_body = payload.get("html_body")
        return await self.send_email(recipient, subject, body, html_body)

class BaseSMSProvider(BaseProvider):
    @abstractmethod
    async def send_sms(self, to_phone: str, message: str) -> Dict[str, Any]:
        pass

    async def send(self, recipient: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        message = payload.get("body", "")
        return await self.send_sms(recipient, message)

class BasePushProvider(BaseProvider):
    @abstractmethod
    async def send_push(self, device_token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        pass

    async def send(self, recipient: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        title = payload.get("title", "Notification")
        body = payload.get("body", "")
        data = payload.get("data")
        return await self.send_push(recipient, title, body, data)

class BaseWhatsappProvider(BaseProvider):
    @abstractmethod
    async def send_whatsapp(self, to_phone: str, message: str) -> Dict[str, Any]:
        pass

    async def send(self, recipient: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        message = payload.get("body", "")
        return await self.send_whatsapp(recipient, message)
