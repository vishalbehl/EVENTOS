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
from datetime import datetime, timedelta, timezone

from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.config import settings
from workers.db import get_db_session
from workers.lib.r2_client import r2
from workers.tasks.notification_tasks import send_email

logger = get_task_logger(__name__)


def _set_export_status(
    organization_uuid: uuid.UUID,
    export_uuid: uuid.UUID | None,
    *,
    status: str,
    event_uuid: uuid.UUID | None = None,
    storage_key: str | None = None,
    expires_at: datetime | None = None,
    failure_reason: str | None = None,
) -> None:
    if export_uuid is None:
        return
    with get_db_session(organization_uuid) as db:
        from app.modules.audit.models.audit_domain_tables import DataExport

        export = db.get(DataExport, export_uuid)
        if export is None or export.organization_id != organization_uuid:
            return
        if event_uuid is not None and export.event_id != event_uuid:
            return
        export.status = status
        export.storage_key = storage_key or export.storage_key
        export.expires_at = expires_at or export.expires_at
        export.failure_reason = failure_reason
        if status == "COMPLETED":
            export.completed_at = datetime.now(timezone.utc)
        db.commit()


# ── Task 1: Event summary report (Excel) ─────────────────────

@app.task(
    bind=True,
    name="workers.tasks.report_tasks.generate_event_summary_report",
    max_retries=2,
    default_retry_delay=60,
    soft_time_limit=300,
)
def generate_event_summary_report(
    self,
    event_id: str,
    organization_id: str,
    requested_by_user_id: str,
    export_id: str | None = None,
) -> dict:
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
    organization_uuid = uuid.UUID(organization_id)
    requester_uuid = uuid.UUID(requested_by_user_id)
    export_uuid = uuid.UUID(export_id) if export_id else None
    logger.info(f"[report] Generating event summary for {event_id} in org={organization_id}")
    _set_export_status(organization_uuid, export_uuid, status="RUNNING", event_uuid=event_uuid)

    with get_db_session(organization_uuid) as db:
        try:
            from app.modules.events.models.event import Event
            from app.modules.events.models.session import Session
            from app.modules.events.models.speaker import Speaker
            from app.modules.presentations.models.presentation_file import PresentationFile
            from app.modules.events.models.session_speaker import SessionSpeaker
            from app.modules.identity.models.user import User
        except ImportError as e:
            _set_export_status(
                organization_uuid,
                export_uuid,
                status="FAILED",
                event_uuid=event_uuid,
                failure_reason=str(e),
            )
            return {"generated": False, "error": str(e)}

        event = db.get(Event, event_uuid)
        if event is None or event.organization_id != organization_uuid:
            _set_export_status(
                organization_uuid,
                export_uuid,
                status="FAILED",
                event_uuid=event_uuid,
                failure_reason="Event not found.",
            )
            return {"generated": False, "error": "Event not found."}

        requester = db.get(User, requester_uuid)
        if requester is None or requester.organization_id != organization_uuid:
            _set_export_status(
                organization_uuid,
                export_uuid,
                status="FAILED",
                event_uuid=event_uuid,
                failure_reason="Requester is not authorized for this event.",
            )
            return {"generated": False, "error": "Requester is not authorized for this event."}

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
    report_key = f"{organization_uuid}/events/{event_uuid}/exports/summary_{ts}.xlsx"
    try:
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_EXPORTS,
            key=report_key,
            data=xlsx_data,
            content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as exc:
        _set_export_status(
            organization_uuid,
            export_uuid,
            status="FAILED",
            event_uuid=event_uuid,
            failure_reason=str(exc),
        )
        raise

    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    _set_export_status(
        organization_uuid,
        export_uuid,
        status="COMPLETED",
        event_uuid=event_uuid,
        storage_key=report_key,
        expires_at=expires_at,
    )

    logger.info(f"[report] Summary report uploaded: {report_key}")

    # Notify requester
    with get_db_session(organization_uuid) as db:
        try:
            from app.modules.identity.models.user import User
            user = db.get(User, requester_uuid)
            if user and user.organization_id == organization_uuid and user.email:
                send_email.delay(
                    to_address=user.email,
                    subject=f"Your event report is ready — {event.name}",
                    html_body=f"""
                    <p>Your event summary report for <strong>{event.name}</strong> is ready.</p>
                    <p>Please return to EventX OS to download it securely. The export expires in 24 hours.</p>
                    """,
                )
        except Exception as exc:
            logger.warning(f"[report] Report {event_id} generated but notification dispatch failed: {exc}")

    return {
        "generated": True,
        "event_id": event_id,
        "report_key": report_key,
        "export_id": str(export_uuid) if export_uuid else None,
        "expires_at": expires_at.isoformat(),
        "sessions": len(sessions),
        "speakers": len(speakers),
    }


# ── Task 2: Session readiness CSV ─────────────────────────────

@app.task(
    name="workers.tasks.report_tasks.generate_session_readiness_csv",
)
def generate_session_readiness_csv(event_id: str, organization_id: str) -> dict:
    """
    Export a CSV of session readiness (for Technician use):
      - Session name, room, time
      - Speaker name, upload status, file format

    Returns the R2 key and a presigned download URL.
    """
    event_uuid = uuid.UUID(event_id)
    organization_uuid = uuid.UUID(organization_id)

    with get_db_session(organization_uuid) as db:
        try:
            from app.modules.events.models.event import Event
            from app.modules.events.models.session import Session
            from app.modules.events.models.session_speaker import SessionSpeaker
            from app.modules.events.models.speaker import Speaker
            from app.modules.presentations.models.presentation_file import PresentationFile
        except ImportError as e:
            return {"generated": False, "error": str(e)}

        event = db.get(Event, event_uuid)
        if event is None or event.organization_id != organization_uuid:
            return {"generated": False, "error": "Event not found."}

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
    csv_key = f"{organization_uuid}/events/{event_uuid}/exports/readiness_{ts}.csv"
    r2.upload_bytes(
        bucket=settings.S3_BUCKET_EXPORTS,
        key=csv_key,
        data=csv_bytes,
        content_type="text/csv; charset=utf-8",
    )
    logger.info(f"[report] Readiness CSV: {csv_key} ({len(rows)} rows)")
    return {"generated": True, "rows": len(rows), "report_key": csv_key}
