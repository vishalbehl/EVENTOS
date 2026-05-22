# =============================================================
# Conference Platform — WhatsApp Service
# backend/app/services/whatsapp_service.py
#
# Delivers WhatsApp notifications via Meta Cloud API.
#
# Use cases:
#   - Upload invitation with link (alternative to email)
#   - Urgent reminders (higher open rate than email)
#   - SRR check-in confirmation
#   - File approval / rejection notifications
#
# All sends are fire-and-forget — errors are logged, not raised.
# WhatsApp messages use approved Meta message templates.
# =============================================================

from __future__ import annotations

import uuid
from typing import Optional

import httpx
from loguru import logger

from app.config import settings


# ── Internal send ─────────────────────────────────────────────

async def _send_whatsapp_message(payload: dict) -> Optional[str]:
    """
    POST a message to the Meta Graph API.

    Returns the message ID on success, None on failure.
    Never raises — all errors are swallowed and logged.
    """
    if not settings.WHATSAPP_ACCESS_TOKEN or not settings.WHATSAPP_PHONE_NUMBER_ID:
        logger.warning("WhatsApp credentials not configured — message skipped.")
        return None

    url = (
        f"{settings.WHATSAPP_API_URL}"
        f"/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    )
    headers = {
        "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
            msg_id = data.get("messages", [{}])[0].get("id")
            logger.info(f"WhatsApp message sent | msg_id={msg_id}")
            return msg_id
    except httpx.HTTPStatusError as exc:
        logger.error(
            f"WhatsApp API error {exc.response.status_code}: {exc.response.text}"
        )
        return None
    except Exception as exc:
        logger.error(f"WhatsApp send failed: {exc}")
        return None


# ── Template message builders ─────────────────────────────────
#
# Meta requires pre-approved template names + language codes.
# Each function builds the correct template payload.
# Template names here are examples — replace with your approved names.

async def send_whatsapp(
    phone: str,
    message: str,
) -> Optional[str]:
    """
    Send a plain free-form text WhatsApp message.
    Only works within 24h of the recipient messaging your number first.
    Use template messages for outbound marketing / notifications.
    """
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalise_phone(phone),
        "type": "text",
        "text": {"body": message},
    }
    return await _send_whatsapp_message(payload)


async def send_upload_invite_whatsapp(
    phone: str,
    speaker_name: str,
    event_name: str,
    upload_url: str,
) -> Optional[str]:
    """
    Send an upload invitation via WhatsApp template message.

    Requires an approved Meta template named 'speaker_upload_invite'
    with parameters: [speaker_name, event_name, upload_url]
    """
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalise_phone(phone),
        "type": "template",
        "template": {
            "name": "speaker_upload_invite",
            "language": {"code": "en_US"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": speaker_name},
                        {"type": "text", "text": event_name},
                        {"type": "text", "text": upload_url},
                    ],
                }
            ],
        },
    }
    return await _send_whatsapp_message(payload)


async def send_upload_reminder_whatsapp(
    phone: str,
    speaker_name: str,
    event_name: str,
    deadline: str,
    upload_url: str,
) -> Optional[str]:
    """
    Send an upload deadline reminder via WhatsApp template.

    Requires approved template 'speaker_upload_reminder'
    with parameters: [speaker_name, event_name, deadline, upload_url]
    """
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalise_phone(phone),
        "type": "template",
        "template": {
            "name": "speaker_upload_reminder",
            "language": {"code": "en_US"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": speaker_name},
                        {"type": "text", "text": event_name},
                        {"type": "text", "text": deadline},
                        {"type": "text", "text": upload_url},
                    ],
                }
            ],
        },
    }
    return await _send_whatsapp_message(payload)


async def send_file_approved_whatsapp(
    phone: str,
    speaker_name: str,
    event_name: str,
) -> Optional[str]:
    """
    Notify speaker via WhatsApp that their file was approved.

    Requires approved template 'speaker_file_approved'
    with parameters: [speaker_name, event_name]
    """
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalise_phone(phone),
        "type": "template",
        "template": {
            "name": "speaker_file_approved",
            "language": {"code": "en_US"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": speaker_name},
                        {"type": "text", "text": event_name},
                    ],
                }
            ],
        },
    }
    return await _send_whatsapp_message(payload)


async def send_srr_checkin_whatsapp(
    phone: str,
    speaker_name: str,
    station_number: int,
) -> Optional[str]:
    """
    Notify speaker they have been assigned to a SRR station.

    Requires approved template 'speaker_srr_assigned'
    with parameters: [speaker_name, station_number]
    """
    payload = {
        "messaging_product": "whatsapp",
        "to": _normalise_phone(phone),
        "type": "template",
        "template": {
            "name": "speaker_srr_assigned",
            "language": {"code": "en_US"},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": speaker_name},
                        {"type": "text", "text": str(station_number)},
                    ],
                }
            ],
        },
    }
    return await _send_whatsapp_message(payload)


# ── Phone number normalisation ────────────────────────────────

def _normalise_phone(phone: str) -> str:
    """
    Strip whitespace and non-digit characters except the leading '+'.
    Meta Cloud API expects E.164 format: +{country_code}{number}
    e.g. +919876543210
    """
    cleaned = phone.strip()
    # Remove all spaces, dashes, parentheses
    cleaned = "".join(c for c in cleaned if c.isdigit() or c == "+")
    if not cleaned.startswith("+"):
        # Assume it already has country code without the +
        cleaned = "+" + cleaned
    return cleaned
