# =============================================================
# Conference Platform — Notification Tasks
# workers/tasks/notification_tasks.py
#
# All outbound communications:
#   - Email via Resend API
#   - WhatsApp via Meta Cloud API
#   - WebSocket push via backend internal API
#   - Import completion summary email
#   - Speaker upload reminder
# =============================================================

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.config import settings
from workers.db import get_db_session

logger = get_task_logger(__name__)


# ── Email via Resend ──────────────────────────────────────────

@app.task(
    bind=True,
    name="workers.tasks.notification_tasks.send_email",
    max_retries=3,
    default_retry_delay=60,
)
def send_email(
    self,
    to_address: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    reply_to: Optional[str] = None,
) -> dict:
    """
    Send a transactional email via the Resend API.

    Args:
        to_address: Recipient email address.
        subject:    Email subject line.
        html_body:  Full HTML email body.
        text_body:  Plain-text fallback (auto-generated if None).
        reply_to:   Optional reply-to address.
    """
    if not settings.RESEND_API_KEY:
        logger.warning("[email] RESEND_API_KEY not set — email skipped.")
        return {"sent": False, "reason": "No API key"}

    payload: dict[str, Any] = {
        "from": f"{settings.EMAIL_FROM_NAME} <{settings.EMAIL_FROM_ADDRESS}>",
        "to": [to_address],
        "subject": subject,
        "html": html_body,
    }
    if text_body:
        payload["text"] = text_body
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.is_success:
            data = resp.json()
            logger.info(f"[email] Sent to {to_address}: id={data.get('id')}")
            return {"sent": True, "resend_id": data.get("id")}
        else:
            reason = f"HTTP {resp.status_code}: {resp.text[:300]}"
            logger.warning(f"[email] Failed to send to {to_address}: {reason}")
            raise self.retry(
                exc=Exception(reason),
                countdown=60 * (self.request.retries + 1),
            )
    except httpx.RequestError as exc:
        raise self.retry(exc=exc)


# ── WhatsApp via Meta Cloud API ───────────────────────────────

@app.task(
    bind=True,
    name="workers.tasks.notification_tasks.send_whatsapp",
    max_retries=3,
    default_retry_delay=60,
)
def send_whatsapp(
    self,
    to_phone: str,
    template_name: str,
    language_code: str = "en",
    components: Optional[list] = None,
) -> dict:
    """
    Send a WhatsApp template message via Meta Cloud API.

    Args:
        to_phone:      E.164 format phone number, e.g. "+919876543210".
        template_name: Approved Meta Business template name.
        language_code: BCP-47 language code (default "en").
        components:    Template variable components (header, body params).
    """
    if not settings.WHATSAPP_ACCESS_TOKEN or not settings.WHATSAPP_PHONE_NUMBER_ID:
        logger.warning("[whatsapp] WhatsApp credentials not configured — skipped.")
        return {"sent": False, "reason": "Not configured"}

    # Sanitise phone: WhatsApp requires digits only, no +
    phone = to_phone.lstrip("+").replace(" ", "").replace("-", "")

    payload: dict[str, Any] = {
        "messaging_product": "whatsapp",
        "to": phone,
        "type": "template",
        "template": {
            "name": template_name,
            "language": {"code": language_code},
        },
    }
    if components:
        payload["template"]["components"] = components

    url = f"{settings.WHATSAPP_API_URL}/{settings.WHATSAPP_PHONE_NUMBER_ID}/messages"
    try:
        with httpx.Client(timeout=15.0) as client:
            resp = client.post(
                url,
                headers={
                    "Authorization": f"Bearer {settings.WHATSAPP_ACCESS_TOKEN}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
        if resp.is_success:
            data = resp.json()
            msg_id = data.get("messages", [{}])[0].get("id")
            logger.info(f"[whatsapp] Sent to {to_phone}: message_id={msg_id}")
            return {"sent": True, "message_id": msg_id}
        else:
            reason = f"HTTP {resp.status_code}: {resp.text[:300]}"
            logger.warning(f"[whatsapp] Failed to send to {to_phone}: {reason}")
            raise self.retry(exc=Exception(reason))
    except httpx.RequestError as exc:
        raise self.retry(exc=exc)


# ── WebSocket push via backend internal API ───────────────────

@app.task(
    bind=True,
    name="workers.tasks.notification_tasks.push_ws_event",
    max_retries=3,
    default_retry_delay=10,
)
def push_ws_event(
    self,
    event_id: str,
    event_type: str,
    payload: dict,
) -> dict:
    """
    Push a real-time WebSocket event via the backend's internal WS push endpoint.
    This allows workers (running in a separate process) to trigger WS broadcasts.

    Args:
        event_id:   UUID of the conference event.
        event_type: e.g. "file.approved", "import.completed".
        payload:    Arbitrary JSON payload to broadcast.
    """
    if not settings.BACKEND_INTERNAL_API_KEY:
        logger.warning("[ws-push] BACKEND_INTERNAL_API_KEY not set — WS push skipped.")
        return {"pushed": False, "reason": "No API key"}

    url = f"{settings.BACKEND_WS_URL}/internal/ws-push"
    body = {
        "event_id": event_id,
        "event_type": event_type,
        "payload": payload,
    }
    try:
        with httpx.Client(timeout=5.0) as client:
            resp = client.post(
                url,
                headers={"X-Internal-API-Key": settings.BACKEND_INTERNAL_API_KEY},
                json=body,
            )
        if resp.is_success:
            logger.debug(f"[ws-push] Pushed {event_type} to event {event_id}")
            return {"pushed": True}
        else:
            raise self.retry(exc=Exception(f"HTTP {resp.status_code}"))
    except httpx.RequestError as exc:
        raise self.retry(exc=exc)


# ── Speaker upload reminder ───────────────────────────────────

@app.task(
    name="workers.tasks.notification_tasks.send_upload_reminder",
)
def send_upload_reminder(speaker_id: str) -> dict:
    """
    Send an email + WhatsApp reminder to a speaker who hasn't uploaded yet.
    """
    speaker_uuid = uuid.UUID(speaker_id)
    with get_db_session() as db:
        try:
            from app.modules.events.models.speaker import Speaker
            from app.modules.events.models.event import Event
        except ImportError as e:
            logger.error(f"Cannot import models: {e}")
            return {"sent": False}

        speaker = db.get(Speaker, speaker_uuid)
        if speaker is None:
            return {"sent": False, "reason": "Speaker not found"}

        event = db.get(Event, speaker.event_id)
        if event is None:
            return {"sent": False, "reason": "Event not found"}

        upload_url = (
            f"{settings.UPLOAD_PORTAL_BASE_URL}/"
            f"{event.short_code}/{speaker._plain_upload_token_for_email}"
        )

        html = _render_reminder_email(
            speaker_name=f"{speaker.first_name} {speaker.last_name}",
            event_name=event.name,
            upload_url=upload_url,
            deadline=event.upload_deadline,
        )

        send_email.delay(
            to_address=speaker.email,
            subject=f"[Action Required] Upload your presentation — {event.name}",
            html_body=html,
        )

        if speaker.phone:
            send_whatsapp.delay(
                to_phone=speaker.phone,
                template_name="speaker_upload_reminder",
                components=[
                    {
                        "type": "body",
                        "parameters": [
                            {"type": "text", "text": speaker.first_name},
                            {"type": "text", "text": event.name},
                        ],
                    }
                ],
            )

    return {"sent": True, "speaker_id": speaker_id}


# ── Import completion notification ────────────────────────────

@app.task(
    name="workers.tasks.notification_tasks.send_import_completion_notification",
)
def send_import_completion_notification(
    import_job_id: str,
    rows_created: int,
    rows_skipped: int,
    error_count: int,
) -> dict:
    """
    Email the organizer a summary when an Excel import completes.
    """
    import_job_uuid = uuid.UUID(import_job_id)
    with get_db_session() as db:
        try:
            from app.modules.registration.models.import_job import ImportJob
            from app.modules.events.models.event import Event
            from app.modules.identity.models.user import User
        except ImportError as e:
            logger.error(f"Cannot import models: {e}")
            return {"sent": False}

        job = db.get(ImportJob, import_job_uuid)
        if job is None:
            return {"sent": False}

        event = db.get(Event, job.event_id)
        organizer = db.get(User, job.created_by) if job.created_by else None

        if not organizer or not organizer.email:
            logger.warning(f"[import-notify] No organizer email for job {import_job_id}")
            return {"sent": False, "reason": "No organizer email"}

        status_word = "succeeded" if error_count == 0 else "completed with errors"
        html = f"""
        <h2>Import {status_word}</h2>
        <p>Your Excel import for <strong>{event.name if event else 'your event'}</strong> has finished.</p>
        <ul>
          <li>✅ Rows created: <strong>{rows_created}</strong></li>
          <li>⏭ Rows skipped: <strong>{rows_skipped}</strong></li>
          <li>❌ Errors: <strong>{error_count}</strong></li>
        </ul>
        <p>Log into the Command Center to review the results.</p>
        """

        send_email.delay(
            to_address=organizer.email,
            subject=f"Import {status_word} — {event.name if event else ''}",
            html_body=html,
        )

    return {"sent": True}


# ── Template helper ───────────────────────────────────────────

def _render_reminder_email(
    speaker_name: str,
    event_name: str,
    upload_url: str,
    deadline: Optional[datetime],
) -> str:
    deadline_str = (
        deadline.strftime("%d %B %Y, %H:%M UTC") if deadline else "see event details"
    )
    return f"""
    <div style="font-family:sans-serif; max-width:600px;">
      <h2>Upload your presentation for {event_name}</h2>
      <p>Dear {speaker_name},</p>
      <p>
        We noticed you haven't uploaded your presentation yet.
        Please upload before the deadline: <strong>{deadline_str}</strong>.
      </p>
      <p>
        <a href="{upload_url}"
           style="background:#1A73E8;color:white;padding:12px 24px;
                  border-radius:6px;text-decoration:none;display:inline-block;">
          Upload Now
        </a>
      </p>
      <p style="color:#666;">
        If you have any issues, reply to this email or contact the conference helpdesk.
      </p>
    </div>
    """
