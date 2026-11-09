# =============================================================
# Conference Platform — Email Service
# backend/app/services/email_service.py
# =============================================================

from __future__ import annotations

import re
import uuid
import bleach
from datetime import datetime, timedelta, timezone
from typing import Optional, Union

import resend
from loguru import logger
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.communications.models.email_log import EmailLog
from app.modules.events.models.speaker import Speaker
from app.modules.communications.models.email_template import EmailTemplate

# Initialise the Resend client once at import time
resend.api_key = settings.RESEND_API_KEY


# ── Template rendering ────────────────────────────────────────

def render_template(template_body: str, variables: dict) -> str:
    """
    Replace {{variable}} placeholders in a template string.
    """
    def _replacer(match: re.Match) -> str:  # type: ignore[type-arg]
        key = match.group(1).strip()
        value = variables.get(key, match.group(0))  # leave placeholder if key missing
        return str(value)

    return re.sub(r"\{\{(.+?)\}\}", _replacer, template_body)


def build_speaker_variables(speaker, session, event: Union[str, object], upload_url=None, session_speakers=None, posters=None, rejection_reason=None, presentation_files=None):
    """
    Build the standard template variable dict for speaker emails.
    Supports both legacy {{ConferenceName}} and new {{EventName}} standards.
    Handles both event object and event_name string.
    """
    from app.services.timezone_service import get_cached_timezone
    if isinstance(event, str):
        event_name = event
        upload_base = ""
        tz_name = get_cached_timezone()
    else:
        event_name = getattr(event, "name", "") or ""
        upload_base = getattr(event, "upload_base_url", "") or ""
        tz_name = getattr(event, "timezone", None) or get_cached_timezone()

    def localize_dt(dt):
        if not dt:
            return None
        try:
            from zoneinfo import ZoneInfo
            # Ensure it is tz-aware (if naive, assume UTC or event timezone)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt.astimezone(ZoneInfo(tz_name))
        except Exception:
            return dt

    if not upload_url:
        token = getattr(speaker, "upload_token", "") or ""
        event_id = getattr(speaker, "event_id", "")
        if upload_base and token:
            upload_url = f"{upload_base}/{event_id}/{token}"
        else:
            # Fallback for manual uploads/invites if base is missing
            upload_url = f"{settings.SPEAKER_PORTAL_BASE_URL}/{event_id}/{token}" if token else ""

    qr_url = getattr(speaker, "qr_code_url", "") or ""

    # Correctly resolve single-session variables using schema start_time and room.name
    session_name = ""
    session_date = ""
    session_time = ""
    room_name = ""

    if session:
        session_name = getattr(session, "name", "") or ""
        s_time = getattr(session, "start_time", None)
        if s_time:
            local_s_time = localize_dt(s_time)
            session_date = local_s_time.strftime("%d %B %Y")
            session_time = local_s_time.strftime("%I:%M %p")
        room = None
        if hasattr(session, "__dict__") and "room" in session.__dict__:
            room = session.room
        if room:
            room_name = getattr(room, "name", "") or ""
    elif posters:
        # Populate legacy single-session variables using the first poster
        first_p = posters[0]
        session_name = getattr(first_p, "title", "") or "Poster Presentation"
        ps = None
        if hasattr(first_p, "__dict__") and "session" in first_p.__dict__:
            ps = first_p.session
        if ps:
            s_time = getattr(ps, "start_time", None)
            if s_time:
                local_s_time = localize_dt(s_time)
                session_date = local_s_time.strftime("%d %B %Y")
                session_time = local_s_time.strftime("%I:%M %p")
            room = None
            if hasattr(ps, "__dict__") and "room" in ps.__dict__:
                room = ps.room
            if room:
                room_name = getattr(room, "name", "") or ""

    # Build dynamic session table
    table_rows_html = []
    table_rows_text = []

    if session_speakers:
        for ss in session_speakers:
            s = None
            if hasattr(ss, "__dict__") and "session" in ss.__dict__:
                s = ss.session
            if not s:
                continue
            
            s_code = getattr(s, "session_code", "") or ""
            s_name = getattr(s, "name", "") or ""
            talk_title = getattr(ss, "presentation_title", "") or s_name or "Presentation"
            
            # Date/Time (prefer speaker talk timing, fallback to session timing)
            dt = getattr(ss, "start_time", None) or getattr(s, "start_time", None)
            if dt:
                local_dt = localize_dt(dt)
                tz_abbrev = local_dt.tzname() or tz_name
                dt_str = local_dt.strftime(f"%d %B %Y, %I:%M %p ({tz_abbrev})")
            else:
                dt_str = "TBD"
            
            # Room
            r = None
            if hasattr(s, "__dict__") and "room" in s.__dict__:
                r = s.room
            r_name = getattr(r, "name", "") if r else ""
            
            table_rows_html.append(f"""
                <tr>
                    <td style="padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #eee; font-weight: bold;">{s_code}</td>
                    <td style="padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #eee;">
                        <div style="font-weight: 600;">{s_name}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 4px; font-style: italic;">Talk: {talk_title}</div>
                    </td>
                    <td style="padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #eee; white-space: nowrap;">{dt_str}</td>
                    <td style="padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #eee;">{r_name}</td>
                </tr>
            """)
            
            table_rows_text.append(f"- Code: {s_code} | Session: {s_name} | Talk: {talk_title} | Time: {dt_str} | Room: {r_name}")

    if posters:
        for p in posters:
            p_code = "POSTER"
            p_title = getattr(p, "title", "") or "Poster Presentation"
            
            # Session info for poster
            ps = None
            if hasattr(p, "__dict__") and "session" in p.__dict__:
                ps = p.session
            ps_name = getattr(ps, "name", "Poster Presentation") if ps else "Poster Session"
            
            dt = getattr(ps, "start_time", None) if ps else None
            if dt:
                local_dt = localize_dt(dt)
                tz_abbrev = local_dt.tzname() or tz_name
                dt_str = local_dt.strftime(f"%d %B %Y, %I:%M %p ({tz_abbrev})")
            else:
                dt_str = "TBD"
                
            # Room / Display Screen
            pr = None
            if ps and hasattr(ps, "__dict__") and "room" in ps.__dict__:
                pr = ps.room
            pr_name = getattr(pr, "name", "") if pr else ""
            
            location = pr_name or "TBD"
                
            table_rows_html.append(f"""
                <tr>
                    <td style="padding: 12px 16px; font-size: 13px; color: #3b82f6; border-bottom: 1px solid #eee; font-weight: bold;">{p_code}</td>
                    <td style="padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #eee;">
                        <div style="font-weight: 600;">{ps_name}</div>
                        <div style="font-size: 11px; color: #666; margin-top: 4px; font-style: italic;">Poster: {p_title}</div>
                    </td>
                    <td style="padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #eee; white-space: nowrap;">{dt_str}</td>
                    <td style="padding: 12px 16px; font-size: 13px; color: #333; border-bottom: 1px solid #eee;">{location}</td>
                </tr>
            """)
            
            table_rows_text.append(f"- Code: {p_code} | Session: {ps_name} | Poster: {p_title} | Time: {dt_str} | Location: {location}")

    if table_rows_html:
        session_table_html = f"""
        <div style="overflow-x: auto; margin: 24px 0; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: inherit;">
                <thead>
                    <tr style="background-color: #f8fafc; border-bottom: 1px solid #e2e8f0;">
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Code</th>
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Session & Talk</th>
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Date & Time</th>
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Room</th>
                    </tr>
                </thead>
                <tbody style="background-color: #ffffff;">
                    {"".join(table_rows_html)}
                </tbody>
            </table>
        </div>
        """
        session_table_text = "\n".join(table_rows_text)
    else:
        session_table_html = "<p style='color: #64748b; font-style: italic;'>No sessions scheduled yet.</p>"
        session_table_text = "No sessions scheduled yet."

    # Format upload deadline variable to beautiful local event timezone
    deadline_str = "20 May 2026"
    if not isinstance(event, str) and event:
        deadline_dt = getattr(event, "upload_deadline", None)
        if deadline_dt:
            local_deadline = localize_dt(deadline_dt)
            tz_abbrev = local_deadline.tzname() or tz_name
            
            day = str(local_deadline.day)
            months = {
                1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun",
                7: "Jul", 8: "Aug", 9: "Sept", 10: "Oct", 11: "Nov", 12: "Dec"
            }
            month_str = months.get(local_deadline.month, local_deadline.strftime("%b"))
            year = str(local_deadline.year)
            
            hour = local_deadline.strftime("%I").lstrip("0")
            if not hour:
                hour = "12"
            minute = local_deadline.strftime("%M")
            am_pm = local_deadline.strftime("%p")
            time_str = f"{hour}:{minute}{am_pm}"
            
            deadline_str = f"{day} {month_str} {year} {time_str} {tz_abbrev}"

    # Resolve Rejection Reason
    rejection_reason_val = rejection_reason
    if not rejection_reason_val:
        files = presentation_files if presentation_files is not None else []
        if presentation_files is None and hasattr(speaker, "__dict__") and "presentation_files" in speaker.__dict__:
            files = speaker.presentation_files
        if files:
            for f in files:
                if getattr(f, "rejection_reason", None):
                    rejection_reason_val = f.rejection_reason
                    break

    if not rejection_reason_val:
        rejection_reason_val = ""

    # ── Resolve Rejected PPT Table ─────────────────────────
    rejected_rows_html = []
    rejected_rows_text = []

    speaker_files = presentation_files if presentation_files is not None else []
    if presentation_files is None and hasattr(speaker, "__dict__") and "presentation_files" in speaker.__dict__:
        speaker_files = speaker.presentation_files

    if speaker_files:
        for f in speaker_files:
            if getattr(f, "upload_status", None) == "rejected":
                f_name = getattr(f, "original_filename", "Presentation File") or "Presentation File"
                reason = getattr(f, "rejection_reason", "No reason provided") or "No reason provided"
                
                # Fetch session name
                s_name = "Session Presentation"
                session_speaker = None
                if hasattr(f, "__dict__") and "session_speaker" in f.__dict__:
                    session_speaker = f.session_speaker
                s_name_session = None
                if session_speaker and hasattr(session_speaker, "__dict__") and "session" in session_speaker.__dict__:
                    s_name_session = session_speaker.session
                if s_name_session:
                    s_name = getattr(s_name_session, "name", "Session Presentation") or "Session Presentation"
                
                # Format size
                size_mb = getattr(f, "file_size_bytes", 0) / (1024 * 1024)
                size_str = f"{size_mb:.2f} MB" if size_mb > 0 else "Unknown Size"
                
                rejected_rows_html.append(f"""
                    <tr style="border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #1e293b;">{s_name}</td>
                        <td style="padding: 12px 16px; font-size: 13px; color: #475569;">
                            <div style="font-family: monospace; font-size: 12px; color: #ef4444; font-weight: bold;">{f_name}</div>
                            <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">{size_str}</div>
                        </td>
                        <td style="padding: 12px 16px; font-size: 13px; color: #b91c1c; background-color: #fef2f2; font-weight: 500; border-radius: 8px;">{reason}</td>
                    </tr>
                """)
                rejected_rows_text.append(f"- Session: {s_name} | File: {f_name} | Rejection Reason: {reason}")

    if rejected_rows_html:
        rejected_table_html = f"""
        <div style="overflow-x: auto; margin: 24px 0; border: 1px solid #fee2e2; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: inherit;">
                <thead>
                    <tr style="background-color: #fef2f2; border-bottom: 1px solid #fee2e2;">
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Session</th>
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Rejected File</th>
                        <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Reason for Rejection</th>
                    </tr>
                </thead>
                <tbody style="background-color: #ffffff;">
                    {"".join(rejected_rows_html)}
                </tbody>
            </table>
        </div>
        """
        rejected_table_text = "\\n".join(rejected_rows_text)
    else:
        # Fallback table if explicit rejection reason was passed to email but no files exist (e.g. initial rejection test)
        if rejection_reason_val:
            rejected_table_html = f"""
            <div style="overflow-x: auto; margin: 24px 0; border: 1px solid #fee2e2; border-radius: 16px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-family: inherit;">
                    <thead>
                        <tr style="background-color: #fef2f2; border-bottom: 1px solid #fee2e2;">
                            <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Session</th>
                            <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Rejected File</th>
                            <th style="padding: 14px 16px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #991b1b;">Reason for Rejection</th>
                        </tr>
                    </thead>
                    <tbody style="background-color: #ffffff;">
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #1e293b;">{session_name or "Session Presentation"}</td>
                            <td style="padding: 12px 16px; font-size: 13px; color: #475569;">
                                <div style="font-family: monospace; font-size: 12px; color: #ef4444; font-weight: bold;">Presentation File</div>
                            </td>
                            <td style="padding: 12px 16px; font-size: 13px; color: #b91c1c; background-color: #fef2f2; font-weight: 500; border-radius: 8px;">{rejection_reason_val}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            """
            rejected_table_text = f"- Session: {session_name or 'Session Presentation'} | File: Presentation File | Rejection Reason: {rejection_reason_val}"
        else:
            rejected_table_html = "<p style='color: #64748b; font-style: italic;'>No rejected presentation files found.</p>"
            rejected_table_text = "No rejected presentation files found."

    qr_img = f'<img src="{qr_url}" width="180" height="210" style="display:block; border:1px solid #eee; border-radius:12px;" alt="Speaker QR Badge" />' if qr_url else ""

    max_file_size_val = "100MB"
    if not isinstance(event, str) and event:
        max_size = getattr(event, "max_file_size_mb", None)
        if max_size:
            max_file_size_val = f"{max_size}MB"

    return {
        "SpeakerName": f"{getattr(speaker, 'first_name', '')} {getattr(speaker, 'last_name', '')}".strip() or "Speaker",
        "SpeakerFirstName": getattr(speaker, "first_name", "") or "",
        "SpeakerEmail": getattr(speaker, "email", "") or "",
        "EventName": event_name,
        "ConferenceName": event_name,  # Backward compatibility
        "SessionName": session_name,
        "SessionDate": session_date,
        "SessionTime": session_time,
        "RoomName": room_name,
        "SessionTable": session_table_html,
        "SessionTableText": session_table_text,
        "RejectedPresentationTable": rejected_table_html,
        "RejectedPPTTable": rejected_table_html,
        "RejectedFilesTable": rejected_table_html,
        "RejectedPresentationTableText": rejected_table_text,
        "UploadLink": upload_url,
        "QRCodeURL": qr_url,
        "QRCodeImg": qr_img,
        "RejectedReason": rejection_reason_val,
        "Deadline": deadline_str,
        "Affiliation": getattr(speaker, "affiliation", "") or "",
        "Country": getattr(speaker, "country", "") or "",
        "UPLOAD DEADLINE": deadline_str,
        "MAX_FILE_SIZE": max_file_size_val,
    }

# ── Core send function ────────────────────────────────────────

def build_participant_variables(participant, event: Union[str, object]):
    """
    Build the standard template variable dict for participant emails.
    """
    if isinstance(event, str):
        event_name = event
        event_code = ""
        location = ""
        venue_name = ""
    else:
        event_name = getattr(event, "name", "") or ""
        event_code = getattr(event, "short_code", "") or ""
        location = getattr(event, "location", "") or ""
        venue_name = getattr(event, "venue_name", "") or ""

    return {
        "ConferenceName": event_name,
        "EventName": event_name,
        "ConferenceCode": event_code,
        "EventCode": event_code,
        "Location": location,
        "Venue": venue_name,
        "ParticipantName": getattr(participant, "name", "") or "",
        "Name": getattr(participant, "name", "") or "",
        "RegNo": getattr(participant, "regno", "") or "",
        "Email": getattr(participant, "email", "") or "",
        "Phone": getattr(participant, "phone", "") or "",
        "Company": getattr(participant, "company", "") or "",
        "Designation": getattr(participant, "designation", "") or "",
        "Country": getattr(participant, "country", "") or "",
        "PaidStatus": getattr(participant, "paid_status", "") or "",
        "Role": getattr(participant, "role", "") or "",
    }


# ── Core send function ────────────────────────────────────────

_EMAIL_CLAIM_LEASE = timedelta(minutes=10)


async def _reject_campaign_preflight(db, log, code):
    from app.modules.notifications.services.campaign_attempt_history import record_campaign_outcome
    await record_campaign_outcome(db, log, status="failed", diagnostic_code=code)
    log.status = "failed"
    log.error_message = code
    await db.commit()


async def claim_campaign_recipient(
    db: AsyncSession,
    *,
    campaign_id: uuid.UUID,
    event_id: uuid.UUID,
    to_email: str,
    subject: str,
    speaker_id: Optional[uuid.UUID] = None,
    participant_id: Optional[uuid.UUID] = None,
    campaign=None,
    organization_id: Optional[uuid.UUID] = None,
    dispatch_id: Optional[uuid.UUID] = None,
    worker_token: Optional[uuid.UUID] = None,
) -> Optional[uuid.UUID]:
    """Claim one campaign recipient before external email delivery.

    A timed-out provider attempt is not proof of non-delivery. Never reclaim
    an uncertain attempt automatically, even after the claim lease expires.
    """
    now = datetime.now(timezone.utc)
    from types import SimpleNamespace
    from app.modules.notifications.services.campaign_authority import reauthorize_dispatch
    from app.modules.notifications.services.campaign_snapshot_service import validate_snapshot_recipient
    if campaign is None or campaign.id != campaign_id or campaign.event_id != event_id:
        raise HTTPException(403, detail={"code": "CAMPAIGN_DISPATCH_AUTHORITY_REQUIRED"})
    await reauthorize_dispatch(db, campaign, organization_id, dispatch_id)
    if (speaker_id is None) == (participant_id is None):
        raise HTTPException(422, detail={"code": "CAMPAIGN_RECIPIENT_REQUIRED"})
    await validate_snapshot_recipient(db, campaign, organization_id, dispatch_id,
        SimpleNamespace(id=speaker_id or participant_id, email=to_email))
    from app.modules.communications.models.email_campaign import EmailCampaign
    if worker_token is None:
        raise HTTPException(403, detail={"code": "CAMPAIGN_WORKER_IDENTITY_REQUIRED"})
    current_dispatch = await db.scalar(select(EmailCampaign.id).where(
        EmailCampaign.id == campaign_id, EmailCampaign.event_id == event_id,
        EmailCampaign.send_dispatch_id == dispatch_id,
        EmailCampaign.worker_token == worker_token,
        EmailCampaign.worker_lease_until > func.clock_timestamp(),
    ).with_for_update())
    if current_dispatch is None:
        raise HTTPException(403, detail={"code": "CAMPAIGN_DISPATCH_REVOKED"})
    from app.modules.platform.models.organization_console import UsageReservation
    live_reservation = await db.scalar(select(UsageReservation.id).where(
        UsageReservation.organization_id == organization_id,
        UsageReservation.event_id == event_id, UsageReservation.status == "RESERVED",
        UsageReservation.metric_key == "max_emails_per_event",
        UsageReservation.metadata_json["campaign_id"].as_string() == str(campaign_id),
        UsageReservation.metadata_json["dispatch_id"].as_string() == str(dispatch_id),
    ).with_for_update())
    if live_reservation is None:
        raise HTTPException(409, detail={"code": "CAMPAIGN_RESERVATION_UNAVAILABLE"})
    existing = await db.scalar(
        select(EmailLog)
        .where(EmailLog.campaign_id == campaign_id, EmailLog.event_id == event_id,
               EmailLog.to_email == to_email)
        .with_for_update()
    )
    if existing:
        if existing.status in {"sent", "delivered"}:
            return None
        if existing.status == "delivery_unknown":
            raise HTTPException(503, detail={"code": "CAMPAIGN_DELIVERY_RECONCILIATION_REQUIRED"})
        if existing.status == "sending":
            if existing.sent_at + _EMAIL_CLAIM_LEASE > now:
                return None
            existing.status = "delivery_unknown"
            existing.error_message = "PROVIDER_OUTCOME_UNCONFIRMED"
            if existing.current_attempt_id is not None:
                from app.modules.notifications.services.campaign_attempt_history import record_campaign_outcome
                await record_campaign_outcome(db, existing, status="delivery_unknown",
                    diagnostic_code="PROVIDER_OUTCOME_UNCONFIRMED")
            await db.commit()
            raise HTTPException(503, detail={"code": "CAMPAIGN_DELIVERY_RECONCILIATION_REQUIRED"})
        existing.status = "sending"
        existing.send_dispatch_id = dispatch_id
        existing.provider_message_id = None
        existing.subject = subject
        existing.speaker_id = speaker_id
        existing.participant_id = participant_id
        existing.error_message = None
        existing.sent_at = now
        from app.modules.notifications.services.campaign_attempt_history import begin_campaign_attempt
        await begin_campaign_attempt(db, existing, organization_id, dispatch_id, speaker_id or participant_id)
        await db.commit()
        return existing.id

    claim = EmailLog(
        campaign_id=campaign_id,
        send_dispatch_id=dispatch_id,
        event_id=event_id,
        speaker_id=speaker_id,
        participant_id=participant_id,
        to_email=to_email,
        subject=subject,
        status="sending",
        sent_at=now,
        css_inlined=True,
    )
    db.add(claim)
    try:
        await db.flush()
        from app.modules.notifications.services.campaign_attempt_history import begin_campaign_attempt
        await begin_campaign_attempt(db, claim, organization_id, dispatch_id, speaker_id or participant_id)
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        original = exc.orig
        cause = getattr(original, "__cause__", None)
        sqlstate = getattr(original, "sqlstate", None) or getattr(cause, "sqlstate", None)
        constraint = getattr(getattr(original, "diag", None), "constraint_name", None) or getattr(cause, "constraint_name", None)
        if sqlstate == "23505" and constraint == "uq_email_logs_campaign_recipient":
            return None
        raise  # ownership/history failures are not harmless duplicate deliveries
    return claim.id


async def send_email(
    *,
    to_email: str,
    subject: str,
    html_body: str,
    text_body: Optional[str] = None,
    speaker_id: Optional[uuid.UUID] = None,
    participant_id: Optional[uuid.UUID] = None,
    campaign_id: Optional[uuid.UUID] = None,
    event_id: Optional[uuid.UUID] = None,
    log_id: Optional[uuid.UUID] = None,
    db: Optional[AsyncSession] = None,
    raise_on_failure: bool = False,
    meter_usage: bool = True,
) -> Optional[str]:
    """
    Send a single email with standardized processing:
    1. Append tracking pixel
    2. Sanitize and prepare final MIME HTML with inline CID attachments
    3. Send email via configured provider (SMTP or Resend)
    """
    event = None
    if campaign_id is not None:
        if db is None or event_id is None or log_id is None:
            raise HTTPException(403, detail={"code": "CAMPAIGN_ATTEMPT_REQUIRED"})
        claimed_log = await db.scalar(select(EmailLog).where(EmailLog.id == log_id,
            EmailLog.campaign_id == campaign_id, EmailLog.event_id == event_id,
            EmailLog.to_email == to_email, EmailLog.status == "sending"))
        if claimed_log is None:
            raise HTTPException(409, detail={"code": "CAMPAIGN_ATTEMPT_UNAVAILABLE"})
        from app.modules.notifications.services.campaign_attempt_history import require_campaign_attempt
        await require_campaign_attempt(db, claimed_log)
        await db.commit()  # never retain validation transaction across provider I/O
    from app.modules.notifications.services.email_resource_policy import (
        byte_size, RENDERED_BYTES, INLINE_IMAGE_BYTES, INLINE_TOTAL_BYTES, INLINE_IMAGE_COUNT,
    )
    try:
        byte_size(html_body, RENDERED_BYTES)
        if text_body is not None:
            byte_size(text_body, RENDERED_BYTES)
        byte_size(subject, 2_000)
        if len(subject) > 500 or len(to_email) > 320 or any(char in subject + to_email for char in "\r\n"):
            raise HTTPException(422, detail={"code": "EMAIL_HEADER_INVALID"})
    except HTTPException as exc:
        if campaign_id is not None:
            await _reject_campaign_preflight(db, claimed_log, exc.detail["code"])
        raise
    if event_id and db:
        from app.modules.events.models.event import Event

        event = await db.scalar(select(Event).where(Event.id == event_id))

    # Generate log ID early if we want to track opens
    log_id = log_id or uuid.uuid4()
    
    # 1. Append tracking pixel
    if event_id and db:
        tracking_url = f"{settings.API_BASE_URL}/events/{event_id}/notifications/track-open/{log_id}"
        pixel_tag = f'<img src="{tracking_url}" width="1" height="1" style="display:none !important;" />'
        html_body = f"{html_body}{pixel_tag}"

    final_html = html_body

    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.image import MIMEImage
    import base64
    import binascii

    # Extract base64 images and convert them to CID attachments
    inline_images = []
    
    def _replace_src_data(match: re.Match) -> str:
        mime_type = match.group(1)
        b64_data = match.group(2)
        cid = f"img_{uuid.uuid4().hex[:12]}@eventos.local"
        if len(inline_images) >= INLINE_IMAGE_COUNT or len(b64_data) > ((INLINE_IMAGE_BYTES + 2) // 3) * 4:
            raise HTTPException(422, detail={"code": "EMAIL_INLINE_IMAGE_LIMIT_EXCEEDED"})
        if mime_type.lower() not in {"image/png", "image/jpeg", "image/gif"}:
            raise HTTPException(422, detail={"code": "EMAIL_INLINE_IMAGE_TYPE_UNSUPPORTED"})
        try:
            image_bytes = base64.b64decode(b64_data, validate=True)
        except (ValueError, binascii.Error) as exc:
            raise HTTPException(422, detail={"code": "EMAIL_INLINE_IMAGE_INVALID"}) from exc
        signatures = {
            "image/png": (b"\x89PNG\r\n\x1a\n",),
            "image/jpeg": (b"\xff\xd8\xff",),
            "image/gif": (b"GIF87a", b"GIF89a"),
        }
        if not image_bytes.startswith(signatures[mime_type.lower()]):
            raise HTTPException(422, detail={"code": "EMAIL_INLINE_IMAGE_INVALID"})
        if len(image_bytes) > INLINE_IMAGE_BYTES or sum(len(item[2]) for item in inline_images) + len(image_bytes) > INLINE_TOTAL_BYTES:
            raise HTTPException(422, detail={"code": "EMAIL_INLINE_IMAGE_LIMIT_EXCEEDED"})
        subtype = mime_type.lower().split("/")[-1]
        inline_images.append((cid, subtype, image_bytes))
        return f'src="cid:{cid}"'

    try:
        final_html = re.sub(r'src=["\']data:([^;]+);base64,([^"\']+)["\']', _replace_src_data, final_html, flags=re.I)
        byte_size(final_html, RENDERED_BYTES)
    except HTTPException as exc:
        if campaign_id is not None:
            await _reject_campaign_preflight(db, claimed_log, exc.detail["code"])
        raise

    # Resolve SMTP Configuration (Environment settings fallback to Database system settings)
    smtp_host = settings.SMTP_HOST
    smtp_port = settings.SMTP_PORT
    smtp_user = settings.SMTP_USER
    smtp_password = settings.SMTP_PASSWORD

    if db and (not smtp_user or not smtp_password):
        try:
            from app.modules.platform.models.system_setting import SystemSetting
            settings_rows = await db.scalars(
                select(SystemSetting).where(
                    SystemSetting.key.in_(["smtp_host", "smtp_port", "smtp_user", "smtp_password"])
                )
            )
            db_smtp = {s.key: s.value for s in settings_rows.all() if s.value}
            if db_smtp.get("smtp_user") and db_smtp.get("smtp_password"):
                smtp_host = db_smtp.get("smtp_host", smtp_host) or "smtp.gmail.com"
                smtp_port = int(db_smtp.get("smtp_port", smtp_port) or 587)
                smtp_user = db_smtp["smtp_user"]
                smtp_password = db_smtp["smtp_password"]
        except Exception as exc:
            logger.debug("SMTP configuration read unavailable: {}", type(exc).__name__)

    resend_enabled = bool(
        settings.RESEND_API_KEY
        and settings.RESEND_API_KEY.strip()
        and settings.RESEND_API_KEY.lower() not in {"disable", "none", "false"}
    )
    smtp_enabled = bool(smtp_user and smtp_password)

    if db is not None:
        await db.commit()  # configuration reads must not retain a transaction during provider I/O

    provider_message_id = None
    error_message = None
    status = "sent"

    if smtp_enabled:
        if inline_images:
            msg = MIMEMultipart('related')
            alt = MIMEMultipart('alternative')
            msg.attach(alt)
        else:
            msg = MIMEMultipart('alternative')
            alt = msg
            
        msg["Subject"] = subject
        sender_email = smtp_user if smtp_user else settings.EMAIL_FROM_ADDRESS
        sender_name = settings.EMAIL_FROM_NAME
        msg["From"] = f"{sender_name} <{sender_email}>"
        msg["To"] = to_email
        
        if text_body:
            alt.attach(MIMEText(text_body, 'plain', 'utf-8'))
        alt.attach(MIMEText(final_html, 'html', 'utf-8'))

        for cid, subtype, image_bytes in inline_images:
            img_part = MIMEImage(image_bytes, _subtype=subtype)
            img_part.add_header('Content-ID', f'<{cid}>')
            img_part.add_header('Content-Disposition', 'inline')
            msg.attach(img_part)

        try:
            is_ssl = (smtp_port == 465)
            await aiosmtplib.send(
                msg,
                hostname=smtp_host,
                port=smtp_port,
                username=smtp_user,
                password=smtp_password,
                start_tls=not is_ssl,
                use_tls=is_ssl,
                timeout=15.0,
            )
            provider_message_id = f"smtp_{uuid.uuid4().hex[:8]}"
            logger.info("Email accepted by SMTP: log={}", log_id)
        except Exception as exc:
            status = "delivery_unknown" if campaign_id else "failed"
            error_message = f"SMTP_OUTCOME_UNCONFIRMED:{type(exc).__name__}"
            logger.error("Email provider delivery failed: {}", error_message)
            if raise_on_failure:
                raise RuntimeError(error_message) from exc
    elif resend_enabled:
        import httpx
        sender_email = settings.EMAIL_FROM_ADDRESS
        sender_name = settings.EMAIL_FROM_NAME
        resend_payload = {
            "from": f"{sender_name} <{sender_email}>",
            "to": [to_email],
            "subject": subject,
            "html": final_html,
        }
        if text_body:
            resend_payload["text"] = text_body

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                resp = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json=resend_payload,
                )
            if resp.is_success:
                data = resp.json()
                provider_message_id = data.get("id")
                if not isinstance(provider_message_id, str) or not provider_message_id:
                    provider_message_id = None
                    status = "delivery_unknown" if campaign_id else "failed"
                    error_message = "PROVIDER_ACCEPTANCE_RECEIPT_UNAVAILABLE"
                logger.info("Email provider response recorded: log={} status={}", log_id, status)
            else:
                status = "delivery_unknown" if campaign_id and resp.status_code >= 500 else "failed"
                error_message = f"PROVIDER_HTTP_{resp.status_code}"
                logger.error("Resend delivery failed: {}", error_message)
                if raise_on_failure:
                    raise RuntimeError(error_message)
        except Exception as exc:
            status = "delivery_unknown" if campaign_id else "failed"
            error_message = f"PROVIDER_OUTCOME_UNCONFIRMED:{type(exc).__name__}"
            logger.error("Resend request error: {}", error_message)
            if raise_on_failure:
                raise RuntimeError(error_message) from exc
    else:
        logger.warning("Email provider configuration is unavailable")
        status = "failed"
        error_message = "EMAIL_PROVIDER_UNAVAILABLE"

    # Every event email is logged, including system/campaign messages without a
    # speaker or participant foreign key.
    if db is not None and event_id is not None:
        log = await db.get(EmailLog, log_id)
        if log is None:
            log = EmailLog(
                id=log_id,
                campaign_id=campaign_id,
                event_id=event_id,
                speaker_id=speaker_id,
                participant_id=participant_id,
                to_email=to_email,
                subject=subject,
                sent_at=datetime.now(timezone.utc),
                css_inlined=True,
            )
            db.add(log)
        if campaign_id is not None:
            from app.modules.notifications.services.campaign_attempt_history import record_campaign_outcome
            await record_campaign_outcome(db, log, status=status,
                provider_receipt=provider_message_id, diagnostic_code=error_message)
        log.status = status
        log.provider_message_id = provider_message_id
        log.error_message = error_message
        log.sent_at = datetime.now(timezone.utc)
        await db.flush()
        if event is not None and meter_usage:
            from app.modules.platform.services.metering_service import MeteringService
            metric_key = "emails" if status in {"queued", "sent", "delivered"} else "email_failures"
            if metric_key == "emails":
                # Charge the accepted recipient once. Delivery-status changes
                # and provider retries reuse this stable key, so queued -> sent
                # -> delivered cannot consume multiple commercial credits.
                await MeteringService.record(db, organization_id=event.organization_id, event_id=event_id, metric_key=metric_key, quantity=1, unit="count", source="notifications.email_service", idempotency_key=f"email:{log.id}:accepted", metadata={"email_log_id": str(log.id), "status": status, "campaign_id": str(campaign_id) if campaign_id else None})
            else:
                await MeteringService.record(db, organization_id=event.organization_id, event_id=event_id, metric_key=metric_key, quantity=1, unit="count", source="notifications.email_service", idempotency_key=f"email:{log.id}:{status}", metadata={"email_log_id": str(log.id), "status": status, "campaign_id": str(campaign_id) if campaign_id else None})

    return provider_message_id


async def send_upload_invitation(
    speaker: Speaker,
    event_name: str,
    upload_url: str,
    template_id: Optional[uuid.UUID] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """
    Send the initial upload invitation email to a speaker.
    """
    variables = build_speaker_variables(speaker, None, event_name, upload_url)
    
    subject = "Your Presentation Upload Link — {{EventName}}"
    html_body = """<p>Dear {{SpeakerName}},</p>
<p>We are pleased to invite you to upload your presentation for <strong>{{EventName}}</strong>.</p>
<p>Please use the following unique link to upload your files:</p>
<p><a href="{{UploadLink}}">{{UploadLink}}</a></p>
<p>Best regards,<br/>The Organizing Committee</p>"""

    if template_id and db:
        # The caller supplies an already-authorized/resolved family ID. Mixed-scope
        # templates opt out of the generic organization-only loader criterion.
        res = await db.execute(
            select(EmailTemplate)
            .where(EmailTemplate.id == template_id)
            .execution_options(skip_tenant_filter=True)
        )
        tpl = res.scalar_one_or_none()
        if tpl:
            subject = tpl.subject
            html_body = tpl.body_html

    from app.modules.notifications.services.email_renderer import render_template as render_with_css
    
    subject = render_template(subject, variables)
    inlined_html, text_fallback = render_with_css(html_body, variables)

    await send_email(
        to_email=speaker.email,
        subject=subject,
        html_body=inlined_html,
        text_body=text_fallback,
        speaker_id=speaker.id,
        event_id=speaker.event_id,
        db=db,
    )


async def send_file_approved(
    speaker: Speaker,
    event_name: str,
    db: Optional[AsyncSession] = None,
) -> None:
    """
    Queue the speaker into a draft Approval email campaign.
    """
    if not db:
        return

    from sqlalchemy import select
    from app.modules.communications.models.email_campaign import EmailCampaign
    from app.modules.events.models.event import Event
    from app.modules.notifications.services.email_template_studio_service import resolve_template_type

    # Find the visual template of type "approval"
    event_row = await db.get(Event, speaker.event_id)
    tpl, _ = await resolve_template_type(
        db,
        organization_id=event_row.organization_id,
        event_id=speaker.event_id,
        template_type="approval",
        target_type="speaker",
    ) if event_row else (None, "EVENT_NOT_FOUND")
    if not tpl:
        return

    # Check if a draft campaign for this template and recipient filter already exists
    res_campaign = await db.execute(
        select(EmailCampaign)
        .where(
            EmailCampaign.event_id == speaker.event_id,
            EmailCampaign.template_id == tpl.id,
            EmailCampaign.recipient_filter == "approved",
            EmailCampaign.status == "draft"
        )
    )
    existing_campaign = res_campaign.scalar_one_or_none()

    if not existing_campaign:
        campaign = EmailCampaign(
            event_id=speaker.event_id,
            template_id=tpl.id,
            name=f"Approved Presentation Notifications — {event_name}",
            recipient_filter="approved",
            status="draft",
            total_recipients=1
        )
        db.add(campaign)


async def send_file_rejected(
    speaker: Speaker,
    event_name: str,
    upload_url: str,
    reason: str,
    db: Optional[AsyncSession] = None,
) -> None:
    """
    Queue the speaker into a draft Rejection email campaign.
    """
    if not db:
        return

    from sqlalchemy import select
    from app.modules.communications.models.email_campaign import EmailCampaign
    from app.modules.events.models.event import Event
    from app.modules.notifications.services.email_template_studio_service import resolve_template_type

    # Find the visual template of type "rejection"
    event_row = await db.get(Event, speaker.event_id)
    tpl, _ = await resolve_template_type(
        db,
        organization_id=event_row.organization_id,
        event_id=speaker.event_id,
        template_type="rejection",
        target_type="speaker",
    ) if event_row else (None, "EVENT_NOT_FOUND")
    if not tpl:
        return

    # Check if a draft campaign for this template and recipient filter already exists
    res_campaign = await db.execute(
        select(EmailCampaign)
        .where(
            EmailCampaign.event_id == speaker.event_id,
            EmailCampaign.template_id == tpl.id,
            EmailCampaign.recipient_filter == "rejected",
            EmailCampaign.status == "draft"
        )
    )
    existing_campaign = res_campaign.scalar_one_or_none()

    if not existing_campaign:
        campaign = EmailCampaign(
            event_id=speaker.event_id,
            template_id=tpl.id,
            name=f"Rejected Presentation Notifications — {event_name}",
            recipient_filter="rejected",
            status="draft",
            total_recipients=1
        )
        db.add(campaign)
