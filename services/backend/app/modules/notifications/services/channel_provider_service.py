from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any

import httpx

from app.config import settings
from app.modules.platform.models.organization_console import (
    OrganizationNotificationChannelConfig,
)


SUPPORTED_PROVIDERS: dict[str, set[str]] = {
    "SMS": {"TWILIO"},
    "WHATSAPP": {"META_CLOUD"},
    "PUSH": {"EXPO"},
}


class ChannelProviderError(RuntimeError):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        retryable: bool = False,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class ProviderOutcome:
    accepted: bool
    provider_message_id: str | None
    response_metadata: dict[str, Any]
    error_code: str | None = None
    error_message: str | None = None
    retryable: bool = False


def _safe_json(response: httpx.Response) -> dict[str, Any]:
    try:
        value = response.json()
        return value if isinstance(value, dict) else {}
    except ValueError:
        return {}


def _provider_error(response: httpx.Response) -> ChannelProviderError:
    body = _safe_json(response)
    provider_code = (
        body.get("code")
        or (body.get("error") or {}).get("code")
        or response.status_code
    )
    retryable = response.status_code == 429 or response.status_code >= 500
    return ChannelProviderError(
        "PROVIDER_REJECTED",
        f"Provider rejected the request ({provider_code}).",
        retryable=retryable,
    )


class ChannelSecretResolver:
    """Resolve secret references without ever returning them through an API."""

    @staticmethod
    def resolve(reference: str | None) -> dict[str, Any]:
        if not reference:
            raise ChannelProviderError(
                "PROVIDER_SECRET_REQUIRED",
                "The channel has no secret reference.",
            )
        if not reference.startswith("env://"):
            raise ChannelProviderError(
                "SECRET_BACKEND_UNAVAILABLE",
                "Only deployment-injected env:// secret references are enabled.",
            )
        variable = reference.removeprefix("env://").strip()
        if not variable or not variable.replace("_", "").isalnum():
            raise ChannelProviderError(
                "INVALID_SECRET_REFERENCE",
                "The environment secret reference is invalid.",
            )
        raw = os.getenv(variable)
        if not raw:
            raise ChannelProviderError(
                "PROVIDER_SECRET_UNAVAILABLE",
                "The referenced provider secret is unavailable.",
            )
        try:
            value = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ChannelProviderError(
                "PROVIDER_SECRET_INVALID",
                "The referenced provider secret must contain a JSON object.",
            ) from exc
        if not isinstance(value, dict):
            raise ChannelProviderError(
                "PROVIDER_SECRET_INVALID",
                "The referenced provider secret must contain a JSON object.",
            )
        return value


class ChannelProviderService:
    @staticmethod
    def validate_configuration(
        config: OrganizationNotificationChannelConfig,
        *,
        resolve_secret: bool = True,
    ) -> dict[str, Any]:
        channel = config.channel.upper()
        provider = config.provider.upper()
        if provider == "TEST" and settings.environment == "testing":
            return {}
        if channel not in SUPPORTED_PROVIDERS:
            raise ChannelProviderError(
                "CHANNEL_NOT_SUPPORTED",
                f"{channel} is not supported by the provider pipeline.",
            )
        if provider not in SUPPORTED_PROVIDERS[channel]:
            raise ChannelProviderError(
                "PROVIDER_NOT_APPROVED",
                f"{provider} is not approved for {channel}.",
            )
        credentials = (
            ChannelSecretResolver.resolve(config.secret_reference)
            if resolve_secret
            else {}
        )
        options = config.configuration or {}
        if provider == "TWILIO":
            required_credentials = {"account_sid", "auth_token"}
            if not required_credentials.issubset(credentials):
                raise ChannelProviderError(
                    "PROVIDER_SECRET_INVALID",
                    "Twilio credentials require account_sid and auth_token.",
                )
            if not str(options.get("from_number") or "").strip():
                raise ChannelProviderError(
                    "PROVIDER_CONFIGURATION_INVALID",
                    "Twilio configuration requires from_number.",
                )
        elif provider == "META_CLOUD":
            if not str(credentials.get("access_token") or "").strip():
                raise ChannelProviderError(
                    "PROVIDER_SECRET_INVALID",
                    "Meta Cloud credentials require access_token.",
                )
            if not str(options.get("phone_number_id") or "").strip():
                raise ChannelProviderError(
                    "PROVIDER_CONFIGURATION_INVALID",
                    "Meta Cloud configuration requires phone_number_id.",
                )
            if not options.get("template_name") and not options.get(
                "allow_session_messages"
            ):
                raise ChannelProviderError(
                    "PROVIDER_CONFIGURATION_INVALID",
                    "Meta Cloud requires template_name or explicit allow_session_messages.",
                )
        elif provider == "EXPO":
            if not str(options.get("project_id") or "").strip():
                raise ChannelProviderError(
                    "PROVIDER_CONFIGURATION_INVALID",
                    "Expo configuration requires project_id.",
                )
        return credentials

    @staticmethod
    async def verify(
        config: OrganizationNotificationChannelConfig,
    ) -> dict[str, Any]:
        provider = config.provider.upper()
        credentials = ChannelProviderService.validate_configuration(config)
        if provider == "TEST" and settings.environment == "testing":
            return {"provider": "TEST", "verified": True}
        timeout = httpx.Timeout(8.0, connect=4.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if provider == "TWILIO":
                    sid = str(credentials["account_sid"])
                    response = await client.get(
                        f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json",
                        auth=(sid, str(credentials["auth_token"])),
                    )
                elif provider == "META_CLOUD":
                    options = config.configuration or {}
                    version = str(options.get("api_version") or "v22.0")
                    phone_id = str(options["phone_number_id"])
                    response = await client.get(
                        f"https://graph.facebook.com/{version}/{phone_id}",
                        params={"fields": "verified_name,display_phone_number"},
                        headers={
                            "Authorization": (
                                f"Bearer {credentials['access_token']}"
                            )
                        },
                    )
                else:
                    # Expo has no side-effect-free credential introspection endpoint.
                    # A validated project id and deployment-injected access token are
                    # the strongest non-delivery verification available.
                    return {
                        "provider": "EXPO",
                        "verified": True,
                        "mode": "CONFIGURATION",
                    }
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise ChannelProviderError(
                "PROVIDER_UNAVAILABLE",
                "The provider could not be reached.",
                retryable=True,
            ) from exc
        if response.status_code >= 400:
            raise _provider_error(response)
        return {
            "provider": provider,
            "verified": True,
            "status_code": response.status_code,
        }

    @staticmethod
    async def deliver(
        config: OrganizationNotificationChannelConfig,
        *,
        recipient: str,
        title: str | None,
        body: str,
        data: dict[str, Any],
    ) -> ProviderOutcome:
        provider = config.provider.upper()
        credentials = ChannelProviderService.validate_configuration(config)
        if provider == "TEST" and settings.environment == "testing":
            if recipient.endswith("0000"):
                return ProviderOutcome(
                    accepted=False,
                    provider_message_id=None,
                    response_metadata={"provider": "TEST"},
                    error_code="TEST_PROVIDER_REJECTED",
                    error_message="Test provider rejected the recipient.",
                )
            return ProviderOutcome(
                accepted=True,
                provider_message_id=f"test-{recipient[-8:]}",
                response_metadata={"provider": "TEST"},
            )

        timeout = httpx.Timeout(12.0, connect=4.0)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                if provider == "TWILIO":
                    sid = str(credentials["account_sid"])
                    response = await client.post(
                        f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json",
                        auth=(sid, str(credentials["auth_token"])),
                        data={
                            "To": recipient,
                            "From": str(config.configuration["from_number"]),
                            "Body": body,
                        },
                    )
                    payload = _safe_json(response)
                    message_id = payload.get("sid")
                elif provider == "META_CLOUD":
                    options = config.configuration or {}
                    version = str(options.get("api_version") or "v22.0")
                    phone_id = str(options["phone_number_id"])
                    if options.get("template_name"):
                        message: dict[str, Any] = {
                            "messaging_product": "whatsapp",
                            "to": recipient,
                            "type": "template",
                            "template": {
                                "name": options["template_name"],
                                "language": {
                                    "code": options.get("language_code", "en_US")
                                },
                                "components": [
                                    {
                                        "type": "body",
                                        "parameters": [
                                            {"type": "text", "text": body}
                                        ],
                                    }
                                ],
                            },
                        }
                    else:
                        message = {
                            "messaging_product": "whatsapp",
                            "to": recipient,
                            "type": "text",
                            "text": {"body": body},
                        }
                    response = await client.post(
                        f"https://graph.facebook.com/{version}/{phone_id}/messages",
                        json=message,
                        headers={
                            "Authorization": (
                                f"Bearer {credentials['access_token']}"
                            )
                        },
                    )
                    payload = _safe_json(response)
                    message_id = (payload.get("messages") or [{}])[0].get("id")
                else:
                    expo_payload = {
                        "to": recipient,
                        "title": title or "Event update",
                        "body": body,
                        "data": data,
                    }
                    headers = {"Content-Type": "application/json"}
                    access_token = credentials.get("access_token")
                    if access_token:
                        headers["Authorization"] = f"Bearer {access_token}"
                    response = await client.post(
                        "https://exp.host/--/api/v2/push/send",
                        json=expo_payload,
                        headers=headers,
                    )
                    payload = _safe_json(response)
                    ticket = payload.get("data") or {}
                    message_id = (
                        ticket.get("id") if isinstance(ticket, dict) else None
                    )
                if response.status_code >= 400:
                    raise _provider_error(response)
                return ProviderOutcome(
                    accepted=True,
                    provider_message_id=message_id,
                    response_metadata={
                        "status_code": response.status_code,
                        "provider": provider,
                    },
                )
        except ChannelProviderError as exc:
            return ProviderOutcome(
                accepted=False,
                provider_message_id=None,
                response_metadata={"provider": provider},
                error_code=exc.code,
                error_message=str(exc),
                retryable=exc.retryable,
            )
        except (httpx.TimeoutException, httpx.NetworkError):
            return ProviderOutcome(
                accepted=False,
                provider_message_id=None,
                response_metadata={"provider": provider},
                error_code="PROVIDER_UNAVAILABLE",
                error_message="The provider could not be reached.",
                retryable=True,
            )
