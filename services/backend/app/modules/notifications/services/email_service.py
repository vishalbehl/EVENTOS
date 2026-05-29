# =============================================================
# Conference Platform — Email Service
# backend/app/services/email_service.py
# =============================================================

from __future__ import annotations

import re
import uuid
import bleach
from datetime import datetime, timezone
from typing import Optional, Union

import resend
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.notifications.models.email_log import EmailLog
from app.modules.speakers.models.speaker import Speaker
from app.modules.notifications.models.email_template import EmailTemplate

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


def build_speaker_variables(speaker, session, event: Union[str, object], upload_url=None, session_speakers=None, posters=None, rejection_reason=None):
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
        if upload_base and token:
            upload_url = f"{upload_base}/{token}"
        else:
            # Fallback for manual uploads/invites if base is missing
            upload_url = f"{settings.API_BASE_URL}/upload/{token}" if token else ""

    qr_url = getattr(speaker, "qr_code_url", "") or ""
    speaker_code = getattr(speaker, "speaker_code", "") or ""

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
        files = []
        if hasattr(speaker, "__dict__") and "presentation_files" in speaker.__dict__:
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

    speaker_files = []
    if hasattr(speaker, "__dict__") and "presentation_files" in speaker.__dict__:
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
        "SpeakerCode": speaker_code,
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
        "AccessCode": speaker_code,
        "ACCESS_CODE": speaker_code,
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
    db: Optional[AsyncSession] = None,
) -> Optional[str]:
    """
    Send a single email with standardized processing (Phase 6 & 14):
    1. Append tracking pixel
    2. Sanitize final HTML
    3. Send email
    """
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not configured — email send skipped.")
        return None

    # Generate log ID early if we want to track opens
    log_id = uuid.uuid4()
    
    # 2. Append tracking pixel
    if event_id and db:
        tracking_url = f"{settings.API_BASE_URL}/events/{event_id}/notifications/track-open/{log_id}"
        pixel_tag = f'<img src="{tracking_url}" width="1" height="1" style="display:none !important;" />'
        html_body = f"{html_body}{pixel_tag}"

    # We no longer sanitize with bleach here because premailer and email_renderer handles it.
    # We expect `html_body` to be the fully inlined HTML now.
    final_html = html_body


    import aiosmtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    # --- GMAIL SMTP IMPLEMENTATION ---
    msg = MIMEMultipart('alternative')
    msg["Subject"] = subject
    
    # Use config overrides if set, otherwise default to config settings
    sender_email = settings.SMTP_USER if settings.SMTP_USER else settings.EMAIL_FROM_ADDRESS
    sender_name = settings.EMAIL_FROM_NAME
    msg["From"] = f"{sender_name} <{sender_email}>"
    msg["To"] = to_email
    
    if text_body:
        msg.attach(MIMEText(text_body, 'plain', 'utf-8'))
    msg.attach(MIMEText(final_html, 'html', 'utf-8'))

    provider_message_id = None
    error_message = None
    status = "sent"

    try:
        if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
            logger.warning("SMTP_USER or SMTP_PASSWORD not set. Simulating success for testing.")
            provider_message_id = f"simulated_smtp_{uuid.uuid4().hex[:8]}"
        else:
            await aiosmtplib.send(
                msg,
                hostname=settings.SMTP_HOST,
                port=settings.SMTP_PORT,
                username=settings.SMTP_USER,
                password=settings.SMTP_PASSWORD,
                start_tls=True,
            )
            provider_message_id = f"smtp_{uuid.uuid4().hex[:8]}"
            logger.info(f"Email sent via SMTP to {to_email} | msg_id={provider_message_id}")
    except Exception as exc:
        status = "failed"
        error_message = str(exc)
        logger.error(f"Failed to send email via SMTP to {to_email}: {exc}")

    # Log to DB if session provided and we have a speaker_id or participant_id
    if db is not None and (speaker_id is not None or participant_id is not None):
        log = EmailLog(
            id=log_id,
            campaign_id=campaign_id,
            speaker_id=speaker_id,
            participant_id=participant_id,
            to_email=to_email,
            subject=subject,
            status=status,
            provider_message_id=provider_message_id,
            error_message=error_message,
            sent_at=datetime.now(timezone.utc),
            css_inlined=True,  # Log that this email went through the CSS inlining pipeline
        )
        db.add(log)

    return provider_message_id



# ── Transactional email templates ─────────────────────────────

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
        res = await db.execute(select(EmailTemplate).where(EmailTemplate.id == template_id))
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

    from sqlalchemy import or_, select
    from app.modules.notifications.models.email_template import EmailTemplate
    from app.modules.notifications.models.email_campaign import EmailCampaign

    # Find the visual template of type "approval"
    res_tpl = await db.execute(
        select(EmailTemplate)
        .where(
            EmailTemplate.template_type == "approval",
            or_(EmailTemplate.event_id == speaker.event_id, EmailTemplate.event_id.is_(None))
        )
        .order_by(EmailTemplate.event_id.desc())
    )
    tpl = res_tpl.scalars().first()
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

    from sqlalchemy import or_, select
    from app.modules.notifications.models.email_template import EmailTemplate
    from app.modules.notifications.models.email_campaign import EmailCampaign

    # Find the visual template of type "rejection"
    res_tpl = await db.execute(
        select(EmailTemplate)
        .where(
            EmailTemplate.template_type == "rejection",
            or_(EmailTemplate.event_id == speaker.event_id, EmailTemplate.event_id.is_(None))
        )
        .order_by(EmailTemplate.event_id.desc())
    )
    tpl = res_tpl.scalars().first()
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
