# =============================================================
# Conference Platform — Report Tasks
# workers/tasks/report_tasks.py
#
# Generate analytics and management reports:
#   1. generate_event_summary_report  — PDF/Excel summary for organizer
#   2. generate_upload_status_report  — Speaker upload completion matrix
#   3. generate_session_readiness_csv — Per-session readiness export
# =============================================================

from __future__ import annotations

import csv
import io
import uuid
from datetime import datetime, timezone

from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.config import settings
from workers.db import get_db_session
from workers.lib.r2_client import r2
from workers.tasks.notification_tasks import send_email

logger = get_task_logger(__name__)


# ── Task 1: Event summary report (Excel) ─────────────────────

@app.task(
    bind=True,
    name="workers.tasks.report_tasks.generate_event_summary_report",
    max_retries=2,
    default_retry_delay=60,
    soft_time_limit=300,
)
def generate_event_summary_report(self, event_id: str, requested_by_user_id: str) -> dict:
    """
    Generate an Excel workbook summarising the event:
      - Sheet 1: Sessions overview
      - Sheet 2: Speakers & upload status
      - Sheet 3: File validation issues

    The report is uploaded to R2 and a presigned download link returned.

    Args:
        event_id:             UUID string of the Event.
        requested_by_user_id: UUID string of the requesting User.
    """
    try:
        import xlsxwriter
    except ImportError:
        logger.error("[report] xlsxwriter not installed.")
        return {"generated": False, "error": "xlsxwriter not available"}

    event_uuid = uuid.UUID(event_id)
    logger.info(f"[report] Generating event summary for {event_id}")

    with get_db_session() as db:
        try:
            from app.modules.rbac.models.event import Event
            from app.modules.speakers.models.session import Session
            from app.modules.speakers.models.speaker import Speaker
            from app.modules.presentations.models.presentation_file import PresentationFile
            from app.modules.speakers.models.session_speaker import SessionSpeaker
        except ImportError as e:
            return {"generated": False, "error": str(e)}

        event = db.get(Event, event_uuid)
        if event is None:
            return {"generated": False, "error": "Event not found."}

        sessions = (
            db.query(Session)
            .filter(Session.event_id == event_uuid)
            .order_by(Session.start_time)
            .all()
        )
        speakers = (
            db.query(Speaker)
            .filter(Speaker.event_id == event_uuid)
            .order_by(Speaker.last_name)
            .all()
        )
        files = (
            db.query(PresentationFile)
            .filter(PresentationFile.event_id == event_uuid)
            .all()
        )

    # ── Build workbook ────────────────────────────────────────
    buf = io.BytesIO()
    wb = xlsxwriter.Workbook(buf, {"in_memory": True})
    _bold = wb.add_format({"bold": True, "bg_color": "#1A73E8", "font_color": "white"})
    _wrap = wb.add_format({"text_wrap": True})

    # Sheet 1: Sessions
    ws1 = wb.add_worksheet("Sessions")
    headers1 = ["Code", "Name", "Room", "Date", "Start", "End", "Status", "Speakers"]
    for col, h in enumerate(headers1):
        ws1.write(0, col, h, _bold)
    for row, s in enumerate(sessions, start=1):
        ws1.write(row, 0, s.session_code)
        ws1.write(row, 1, s.name)
        ws1.write(row, 2, s.room.name if s.room else "")
        ws1.write(row, 3, s.start_time.strftime("%Y-%m-%d") if s.start_time else "")
        ws1.write(row, 4, s.start_time.strftime("%H:%M") if s.start_time else "")
        ws1.write(row, 5, s.end_time.strftime("%H:%M") if s.end_time else "")
        ws1.write(row, 6, s.status)
        ws1.write(row, 7, len(s.session_speakers))

    # Sheet 2: Speakers
    ws2 = wb.add_worksheet("Speakers")
    headers2 = ["Name", "Email", "Phone", "Affiliation", "Upload Status", "File Count"]
    for col, h in enumerate(headers2):
        ws2.write(0, col, h, _bold)
    for row, sp in enumerate(speakers, start=1):
        spk_files = [f for f in files if f.speaker_id == sp.id]
        ws2.write(row, 0, f"{sp.first_name} {sp.last_name}")
        ws2.write(row, 1, sp.email)
        ws2.write(row, 2, sp.phone or "")
        ws2.write(row, 3, sp.affiliation or "")
        ws2.write(row, 4, sp.upload_status)
        ws2.write(row, 5, len(spk_files))

    # Sheet 3: File Issues
    ws3 = wb.add_worksheet("File Issues")
    headers3 = ["File ID", "Filename", "Format", "Status", "Errors", "Warnings"]
    for col, h in enumerate(headers3):
        ws3.write(0, col, h, _bold)
    problem_files = [f for f in files if f.upload_status in ("validation_failed", "pending_validation")]
    for row, pf in enumerate(problem_files, start=1):
        ws3.write(row, 0, str(pf.id))
        ws3.write(row, 1, pf.original_filename)
        ws3.write(row, 2, pf.file_format)
        ws3.write(row, 3, pf.upload_status)

    wb.close()
    xlsx_data = buf.getvalue()

    # Upload
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report_key = f"exports/{event_id}/summary_{ts}.xlsx"
    r2.upload_bytes(
        bucket=settings.S3_BUCKET_EXPORTS,
        key=report_key,
        data=xlsx_data,
        content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    download_url = r2.generate_presigned_url(
        bucket=settings.S3_BUCKET_EXPORTS,
        key=report_key,
        expiry=3600 * 24,  # 24 hours
    )

    logger.info(f"[report] Summary report uploaded: {report_key}")

    # Notify requester
    with get_db_session() as db:
        try:
            from app.modules.auth.models.user import User
            user = db.get(User, uuid.UUID(requested_by_user_id))
            if user and user.email:
                send_email.delay(
                    to_address=user.email,
                    subject=f"Your event report is ready — {event.name}",
                    html_body=f"""
                    <p>Your event summary report for <strong>{event.name}</strong> is ready.</p>
                    <p><a href="{download_url}">Download Report</a> (link expires in 24 hours)</p>
                    """,
                )
        except Exception:
            pass

    return {
        "generated": True,
        "event_id": event_id,
        "report_key": report_key,
        "download_url": download_url,
        "sessions": len(sessions),
        "speakers": len(speakers),
    }


# ── Task 2: Session readiness CSV ─────────────────────────────

@app.task(
    name="workers.tasks.report_tasks.generate_session_readiness_csv",
)
def generate_session_readiness_csv(event_id: str) -> dict:
    """
    Export a CSV of session readiness (for Technician use):
      - Session name, room, time
      - Speaker name, upload status, file format

    Returns the R2 key and a presigned download URL.
    """
    event_uuid = uuid.UUID(event_id)

    with get_db_session() as db:
        try:
            from app.modules.speakers.models.session import Session
            from app.modules.speakers.models.session_speaker import SessionSpeaker
            from app.modules.speakers.models.speaker import Speaker
            from app.modules.presentations.models.presentation_file import PresentationFile
        except ImportError as e:
            return {"generated": False, "error": str(e)}

        rows = (
            db.query(SessionSpeaker, Session, Speaker)
            .join(Session, SessionSpeaker.session_id == Session.id)
            .join(Speaker, SessionSpeaker.speaker_id == Speaker.id)
            .filter(Session.event_id == event_uuid)
            .order_by(Session.start_time, SessionSpeaker.talk_order)
            .all()
        )

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "Session Code", "Session Name", "Room",
        "Start Time", "Talk Order",
        "Speaker Name", "Email", "Upload Status",
        "Presentation Title", "File Format",
    ])

    for ss, sess, sp in rows:
        writer.writerow([
            sess.session_code, sess.name,
            sess.room.name if sess.room else "",
            sess.start_time.strftime("%Y-%m-%d %H:%M") if sess.start_time else "",
            ss.talk_order,
            f"{sp.first_name} {sp.last_name}", sp.email, sp.upload_status,
            ss.presentation_title or "",
            "",  # file_format would need a join on PresentationFile
        ])

    csv_bytes = buf.getvalue().encode("utf-8-sig")  # BOM for Excel compatibility

    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    csv_key = f"exports/{event_id}/readiness_{ts}.csv"
    r2.upload_bytes(
        bucket=settings.S3_BUCKET_EXPORTS,
        key=csv_key,
        data=csv_bytes,
        content_type="text/csv; charset=utf-8",
    )
    download_url = r2.generate_presigned_url(
        bucket=settings.S3_BUCKET_EXPORTS,
        key=csv_key,
        expiry=3600 * 6,  # 6 hours
    )

    logger.info(f"[report] Readiness CSV: {csv_key} ({len(rows)} rows)")
    return {"generated": True, "rows": len(rows), "download_url": download_url}
