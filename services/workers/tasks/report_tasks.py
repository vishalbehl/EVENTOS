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
import json
import uuid
from datetime import datetime, timedelta, timezone

from celery.utils.log import get_task_logger

from workers.celery_app import app
from workers.config import settings
from workers.db import get_db_session
from workers.lib.r2_client import r2
from workers.tasks.notification_tasks import send_email

logger = get_task_logger(__name__)


COMMERCIAL_REPORT_FORMATS = {
    "hardware_catalog": ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "staff_catalog": ("xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "pricing_simulations": ("csv", "text/csv; charset=utf-8"),
    "pricing_rules": ("pdf", "application/pdf"),
}


def _expire_tenant_exports(organization_id: uuid.UUID, *, limit: int = 500) -> dict[str, int]:
    """Delete expired tenant artifacts while retaining their immutable job records."""
    from app.modules.audit.models.audit_domain_tables import DataExport

    now = datetime.now(timezone.utc)
    deleted = 0
    failed = 0
    with get_db_session(organization_id) as db:
        exports = (
            db.query(DataExport)
            .filter(
                DataExport.organization_id == organization_id,
                DataExport.expires_at.is_not(None),
                DataExport.expires_at <= now,
                DataExport.storage_key.is_not(None),
            )
            .order_by(DataExport.expires_at.asc(), DataExport.id.asc())
            .limit(limit)
            .all()
        )
        for export in exports:
            try:
                r2.delete_object(settings.S3_BUCKET_EXPORTS, export.storage_key)
            except Exception:
                failed += 1
                logger.exception("[report] Failed to delete expired export %s", export.id)
                continue
            export.storage_key = None
            export.status = "EXPIRED"
            export.failure_reason = None
            deleted += 1
        db.commit()
    return {"expired": deleted, "failed": failed}


@app.task(
    name="workers.tasks.report_tasks.expire_tenant_exports",
    soft_time_limit=300,
)
def expire_tenant_exports(organization_id: str, limit: int = 500) -> dict[str, int]:
    """Tenant-scoped retention command; control-plane fanout supplies each tenant."""
    return _expire_tenant_exports(uuid.UUID(organization_id), limit=max(1, min(limit, 2000)))


def _cell_value(value):
    if value is None:
        return ""
    if isinstance(value, (datetime,)):
        return value.isoformat()
    return str(value)


def _build_commercial_report_artifact(report_type: str, rows: list[dict]) -> tuple[bytes, str, str]:
    """Build a deterministic artifact from already-authorized source rows."""
    if report_type not in COMMERCIAL_REPORT_FORMATS:
        raise ValueError(f"Unsupported commercial report type: {report_type}")
    extension, content_type = COMMERCIAL_REPORT_FORMATS[report_type]
    columns = list(rows[0]) if rows else ["status"]
    safe_rows = rows or [{"status": "No records found"}]

    if extension == "csv":
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows({key: _cell_value(row.get(key)) for key in columns} for row in safe_rows)
        return b"\xef\xbb\xbf" + stream.getvalue().encode("utf-8"), extension, content_type

    if extension == "xlsx":
        import xlsxwriter

        buffer = io.BytesIO()
        workbook = xlsxwriter.Workbook(buffer, {"in_memory": True})
        sheet = workbook.add_worksheet("Report")
        header = workbook.add_format({"bold": True, "bg_color": "#12372A", "font_color": "#FFFFFF"})
        for column_index, column in enumerate(columns):
            sheet.write(0, column_index, column, header)
            sheet.set_column(column_index, column_index, min(max(len(column) + 4, 14), 40))
        for row_index, row in enumerate(safe_rows, start=1):
            for column_index, column in enumerate(columns):
                sheet.write(row_index, column_index, _cell_value(row.get(column)))
        sheet.autofilter(0, 0, max(len(safe_rows), 1), max(len(columns) - 1, 0))
        sheet.freeze_panes(1, 0)
        workbook.close()
        return buffer.getvalue(), extension, content_type

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    document = SimpleDocTemplate(buffer, pagesize=landscape(A4), title="Commercial pricing rules")
    styles = getSampleStyleSheet()
    table_rows = [columns] + [[_cell_value(row.get(column)) for column in columns] for row in safe_rows]
    table = Table(table_rows, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12372A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    document.build([
        Paragraph("Pricing and Margin Rules Overview", styles["Title"]),
        Paragraph("Generated from persisted pricing rule records.", styles["Normal"]),
        Spacer(1, 12),
        table,
    ])
    return buffer.getvalue(), extension, content_type


def _commercial_report_rows(db, organization_uuid: uuid.UUID, report_type: str) -> list[dict]:
    if report_type == "hardware_catalog":
        from app.modules.inventory.models import HardwareCategory, HardwareItem, HardwareStock

        records = (
            db.query(HardwareItem, HardwareCategory, HardwareStock)
            .join(HardwareCategory, HardwareCategory.id == HardwareItem.category_id)
            .outerjoin(HardwareStock, HardwareStock.hardware_id == HardwareItem.id)
            .order_by(HardwareCategory.name, HardwareItem.name)
            .all()
        )
        return [{
            "asset_code": item.asset_code,
            "category": category.name,
            "name": item.name,
            "brand": item.brand,
            "model": item.model,
            "purchase_cost": item.purchase_cost,
            "renting_price": item.renting_price,
            "pricing_unit": item.pricing_unit,
            "status": item.status,
            "quantity": stock.quantity if stock else 0,
            "available_quantity": stock.available_quantity if stock else 0,
        } for item, category, stock in records]

    if report_type == "staff_catalog":
        from app.modules.commercial.models import StaffRole

        records = db.query(StaffRole).order_by(StaffRole.team_category, StaffRole.role_name).all()
        return [{
            "role_code": item.role_code,
            "role_name": item.role_name,
            "team_category": item.team_category,
            "grade": item.grade,
            "cost_per_day": item.cost_per_day,
            "selling_per_day": item.selling_per_day,
            "available_count": item.available_count,
            "status": item.status,
        } for item in records]

    if report_type == "pricing_simulations":
        from app.modules.pricing.models import PricingSimulation

        records = (
            db.query(PricingSimulation)
            .filter(PricingSimulation.organization_id == organization_uuid)
            .order_by(PricingSimulation.created_at.desc())
            .limit(5000)
            .all()
        )
        return [{
            "simulation_id": item.id,
            "name": item.name,
            "min_attendees": item.min_attendees,
            "max_attendees": item.max_attendees,
            "desk_count": item.desk_count,
            "min_speakers": item.min_speakers,
            "max_speakers": item.max_speakers,
            "calculated_total": (item.output_data or {}).get("grand_total", (item.output_data or {}).get("total")),
            "created_at": item.created_at,
        } for item in records]

    if report_type == "pricing_rules":
        from app.modules.pricing.models import PricingRule

        records = (
            db.query(PricingRule)
            .filter((PricingRule.organization_id == organization_uuid) | (PricingRule.organization_id.is_(None)))
            .order_by(PricingRule.priority.desc(), PricingRule.name)
            .all()
        )
        return [{
            "code": item.code,
            "name": item.name,
            "scope": "ORGANIZATION" if item.organization_id else "GLOBAL",
            "status": item.status,
            "priority": item.priority,
            "effective_from": item.effective_from,
            "effective_to": item.effective_to,
            "description": item.description,
        } for item in records]

    raise ValueError(f"Unsupported commercial report type: {report_type}")


def _build_quote_proposal_pdf(snapshot: dict, proposal_number: str, proposal_version: int) -> bytes:
    """Render only the immutable client-safe proposal snapshot."""
    from xml.sax.saxutils import escape

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer, pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=18 * mm,
        title=proposal_number, author="Event OS",
    )
    styles = getSampleStyleSheet()
    story = [
        Paragraph("Commercial Proposal", styles["Title"]),
        Paragraph(f"{escape(proposal_number)} &nbsp; | &nbsp; Version {proposal_version}", styles["Normal"]),
        Spacer(1, 10 * mm),
        Paragraph(escape(str(snapshot.get("title") or "Event services")), styles["Heading1"]),
        Paragraph(
            f"Quote reference: {escape(str(snapshot.get('quote_number') or ''))} &nbsp; | &nbsp; "
            f"Valid until: {escape(str(snapshot.get('valid_until') or 'Not specified'))}",
            styles["Normal"],
        ),
        Spacer(1, 7 * mm),
    ]
    rows = [["Category", "Description", "Qty", "Days", "Rate", "Amount"]]
    for item in snapshot.get("line_items", []):
        rows.append([
            str(item.get("category") or ""), str(item.get("name") or ""),
            str(item.get("quantity") or "0"), str(item.get("duration_days") or "1"),
            str(item.get("unit_rate") or "0"), str(item.get("line_subtotal") or "0"),
        ])
    table = Table(rows, colWidths=[25 * mm, 55 * mm, 14 * mm, 14 * mm, 25 * mm, 28 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12372A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
        ("ALIGN", (2, 1), (-1, -1), "RIGHT"),
    ]))
    story.extend([table, Spacer(1, 8 * mm)])
    currency = escape(str(snapshot.get("currency") or "INR"))
    totals = [
        ["Subtotal", f"{currency} {snapshot.get('subtotal', '0.00')}"],
        ["Discount", f"{currency} {snapshot.get('discount_amount', '0.00')}"],
        [f"Tax ({snapshot.get('tax_rate', '0')}%)", f"{currency} {snapshot.get('tax_amount', '0.00')}"],
        ["Total", f"{currency} {snapshot.get('total_amount', '0.00')}"],
    ]
    totals_table = Table(totals, colWidths=[45 * mm, 45 * mm], hAlign="RIGHT")
    totals_table.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#12372A")),
        ("TOPPADDING", (0, -1), (-1, -1), 6),
    ]))
    story.extend([
        totals_table, Spacer(1, 12 * mm),
        Paragraph("This document was generated from an approved, version-locked quote snapshot.", styles["Italic"]),
    ])
    document.build(story)
    return buffer.getvalue()


def _build_invoice_pdf(snapshot: dict) -> bytes:
    """Render a version-bound invoice snapshot without re-reading mutable totals."""
    from xml.sax.saxutils import escape

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import mm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    invoice_number = str(snapshot.get("invoice_number") or "Invoice")
    document = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=18 * mm,
        title=invoice_number,
        author="Event OS",
    )
    styles = getSampleStyleSheet()
    currency = escape(str(snapshot.get("currency") or "INR"))
    story = [
        Paragraph("Tax Invoice", styles["Title"]),
        Paragraph(escape(invoice_number), styles["Heading2"]),
        Paragraph(escape(str(snapshot.get("organization_name") or "Organization")), styles["Normal"]),
        Spacer(1, 5 * mm),
        Paragraph(
            f"Issued: {escape(str(snapshot.get('issued_at') or 'Not recorded'))}<br/>"
            f"Due: {escape(str(snapshot.get('due_date') or 'Not recorded'))}<br/>"
            f"Status: {escape(str(snapshot.get('status') or 'UNKNOWN'))}",
            styles["Normal"],
        ),
        Spacer(1, 8 * mm),
    ]
    rows = [["Description", "Quantity", "Amount"]]
    for item in snapshot.get("items") or []:
        rows.append([
            escape(str(item.get("description") or "Invoice item")),
            str(item.get("quantity") or 1),
            f"{currency} {escape(str(item.get('amount') or '0.00'))}",
        ])
    if len(rows) == 1:
        rows.append(["Invoice charge", "1", f"{currency} {escape(str(snapshot.get('amount') or '0.00'))}"])
    table = Table(rows, colWidths=[105 * mm, 25 * mm, 40 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#12372A")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F8FAFC")]),
    ]))
    totals = Table([
        ["Subtotal", f"{currency} {snapshot.get('amount', '0.00')}"],
        ["GST", f"{currency} {snapshot.get('gst_amount', '0.00')}"],
        ["Total", f"{currency} {snapshot.get('total_amount', '0.00')}"],
    ], colWidths=[45 * mm, 45 * mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE", (0, -1), (-1, -1), 1, colors.HexColor("#12372A")),
    ]))
    story.extend([table, Spacer(1, 8 * mm), totals, Spacer(1, 12 * mm)])
    story.append(Paragraph("Generated from an immutable, version-bound Event OS invoice snapshot.", styles["Italic"]))
    document.build(story)
    return buffer.getvalue()


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


@app.task(
    bind=True,
    name="workers.tasks.report_tasks.generate_commercial_report_export",
    max_retries=2,
    default_retry_delay=60,
    soft_time_limit=300,
)
def generate_commercial_report_export(
    self,
    organization_id: str,
    requested_by_user_id: str,
    export_id: str,
    report_type: str,
) -> dict:
    organization_uuid = uuid.UUID(organization_id)
    requester_uuid = uuid.UUID(requested_by_user_id)
    export_uuid = uuid.UUID(export_id)
    _set_export_status(organization_uuid, export_uuid, status="RUNNING")

    try:
        with get_db_session(organization_uuid) as db:
            from app.modules.audit.models.audit_domain_tables import DataExport

            export = db.get(DataExport, export_uuid)
            expected_type = f"commercial_{report_type}"
            if (
                export is None
                or export.organization_id != organization_uuid
                or export.requested_by != requester_uuid
                or export.source_type != "commercial_report"
                or export.export_type != expected_type
            ):
                raise ValueError("Commercial export contract mismatch.")
            rows = _commercial_report_rows(db, organization_uuid, report_type)

        artifact, extension, content_type = _build_commercial_report_artifact(report_type, rows)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        storage_key = (
            f"{organization_uuid}/platform-exports/"
            f"{report_type}_{export_uuid}_{timestamp}.{extension}"
        )
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_EXPORTS,
            key=storage_key,
            data=artifact,
            content_type=content_type,
        )
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        _set_export_status(
            organization_uuid,
            export_uuid,
            status="COMPLETED",
            storage_key=storage_key,
            expires_at=expires_at,
        )
        return {
            "generated": True,
            "export_id": str(export_uuid),
            "report_type": report_type,
            "row_count": len(rows),
            "storage_key": storage_key,
            "expires_at": expires_at.isoformat(),
        }
    except Exception as exc:
        logger.exception("[report] Commercial export failed: %s", report_type)
        _set_export_status(
            organization_uuid,
            export_uuid,
            status="FAILED",
            failure_reason=str(exc)[:1000],
        )
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise


@app.task(
    bind=True,
    name="workers.tasks.report_tasks.generate_invoice_pdf",
    max_retries=2,
    default_retry_delay=60,
    soft_time_limit=180,
)
def generate_invoice_pdf(
    self,
    organization_id: str,
    invoice_id: str,
    requested_by_user_id: str,
    export_id: str,
) -> dict:
    organization_uuid = uuid.UUID(organization_id)
    invoice_uuid = uuid.UUID(invoice_id)
    requester_uuid = uuid.UUID(requested_by_user_id)
    export_uuid = uuid.UUID(export_id)
    _set_export_status(organization_uuid, export_uuid, status="RUNNING")
    try:
        with get_db_session(organization_uuid) as db:
            from app.modules.audit.models.audit_domain_tables import DataExport

            export = db.get(DataExport, export_uuid)
            if (
                export is None
                or export.organization_id != organization_uuid
                or export.requested_by != requester_uuid
                or export.source_type != "invoice_pdf"
                or export.source_id != invoice_uuid
                or export.export_type != "invoice_pdf"
            ):
                raise ValueError("Invoice artifact command scope is invalid.")
            snapshot = dict((export.request_metadata or {}).get("snapshot") or {})
            if not snapshot or not export.source_version:
                raise ValueError("Invoice artifact snapshot is missing.")

        artifact = _build_invoice_pdf(snapshot)
        invoice_number = str(snapshot.get("invoice_number") or invoice_uuid).replace("/", "-")
        storage_key = (
            f"{organization_uuid}/control-plane/invoices/{invoice_uuid}/"
            f"v{export.source_version}/{invoice_number}.pdf"
        )
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_EXPORTS,
            key=storage_key,
            data=artifact,
            content_type="application/pdf",
        )
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        _set_export_status(
            organization_uuid,
            export_uuid,
            status="COMPLETED",
            storage_key=storage_key,
            expires_at=expires_at,
        )
        return {
            "generated": True,
            "invoice_id": invoice_id,
            "invoice_version": export.source_version,
            "export_id": export_id,
            "storage_key": storage_key,
            "expires_at": expires_at.isoformat(),
        }
    except Exception as exc:
        logger.exception("[report] Invoice PDF generation failed: %s", invoice_id)
        _set_export_status(
            organization_uuid,
            export_uuid,
            status="FAILED",
            failure_reason=str(exc)[:1000],
        )
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise


@app.task(
    bind=True,
    name="workers.tasks.report_tasks.generate_audit_log_export",
    max_retries=2,
    default_retry_delay=60,
    soft_time_limit=300,
)
def generate_audit_log_export(
    self,
    organization_id: str,
    requested_by_user_id: str,
    export_id: str,
) -> dict:
    organization_uuid = uuid.UUID(organization_id)
    requester_uuid = uuid.UUID(requested_by_user_id)
    export_uuid = uuid.UUID(export_id)
    _set_export_status(organization_uuid, export_uuid, status="RUNNING")
    try:
        with get_db_session(organization_uuid) as db:
            from app.modules.audit.models.audit_domain_tables import DataExport
            from app.modules.audit.models.audit_log import AuditLog

            export = db.get(DataExport, export_uuid)
            if (
                export is None
                or export.organization_id != organization_uuid
                or export.requested_by != requester_uuid
                or export.source_type != "audit_log_export"
            ):
                raise ValueError("Audit export contract mismatch.")
            metadata = export.request_metadata or {}
            query = db.query(AuditLog).filter(AuditLog.organization_id == organization_uuid)
            if metadata.get("action_type"):
                query = query.filter(AuditLog.action_type == metadata["action_type"])
            if metadata.get("actor_user_id"):
                query = query.filter(AuditLog.actor_user_id == uuid.UUID(metadata["actor_user_id"]))
            if metadata.get("occurred_from"):
                query = query.filter(AuditLog.occurred_at >= datetime.fromisoformat(metadata["occurred_from"]))
            if metadata.get("occurred_to"):
                query = query.filter(AuditLog.occurred_at <= datetime.fromisoformat(metadata["occurred_to"]))
            if metadata.get("sensitive_only"):
                query = query.filter(AuditLog.is_sensitive.is_(True))
            logs = query.order_by(AuditLog.occurred_at.desc(), AuditLog.id.desc()).limit(250_000).all()

        columns = [
            "id", "occurred_at", "action_type", "resource_type", "resource_id",
            "actor_user_id", "actor_role", "request_id", "correlation_id", "row_hash", "is_sensitive",
        ]
        stream = io.StringIO(newline="")
        writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        for log in logs:
            writer.writerow({column: _cell_value(getattr(log, column, None)) for column in columns})
        artifact = stream.getvalue().encode("utf-8-sig")
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        storage_key = f"{organization_uuid}/audit-exports/audit_{export_uuid}_{timestamp}.csv"
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_EXPORTS,
            key=storage_key,
            data=artifact,
            content_type="text/csv; charset=utf-8",
        )
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        _set_export_status(
            organization_uuid, export_uuid, status="COMPLETED",
            storage_key=storage_key, expires_at=expires_at,
        )
        return {"generated": True, "export_id": str(export_uuid), "row_count": len(logs)}
    except Exception as exc:
        logger.exception("[report] Audit export failed")
        _set_export_status(organization_uuid, export_uuid, status="FAILED", failure_reason=str(exc)[:1000])
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc)
        raise


@app.task(
    bind=True,
    name="workers.tasks.report_tasks.generate_organization_console_export",
    max_retries=2,
    default_retry_delay=60,
    soft_time_limit=600,
)
def generate_organization_console_export(self, organization_id: str, requested_by_user_id: str, export_id: str) -> dict:
    organization_uuid = uuid.UUID(organization_id)
    requester_uuid = uuid.UUID(requested_by_user_id)
    export_uuid = uuid.UUID(export_id)
    _set_export_status(organization_uuid, export_uuid, status="RUNNING")
    try:
        with get_db_session(organization_uuid) as db:
            from app.modules.audit.models.audit_domain_tables import DataExport
            from app.modules.audit.models.audit_log import AuditLog
            from app.modules.communications.models.email_campaign import EmailCampaign
            from app.modules.events.models.event import Event
            from app.modules.events.models.session import Session
            from app.modules.events.models.speaker import Speaker
            from app.modules.identity.models.user import User
            from app.modules.platform.models.organization_console import PrivilegedAccessSession
            from app.modules.presentations.models.presentation_file import PresentationFile
            from app.modules.rbac.models.user_assignment import UserEventAssignment
            from app.modules.registration.models.participant_registration import ParticipantRegistration
            from app.modules.registration.models.payment_transaction import PaymentTransaction

            export = db.get(DataExport, export_uuid)
            if not export or export.organization_id != organization_uuid or export.requested_by != requester_uuid or export.source_type != "organization_console_export":
                raise ValueError("Organization Console export contract mismatch.")
            metadata = export.request_metadata or {}
            domains = set(metadata.get("domains") or [])
            include_sensitive = bool(metadata.get("include_sensitive"))
            if include_sensitive:
                session_id = metadata.get("privileged_access_session_id")
                access = db.get(PrivilegedAccessSession, uuid.UUID(session_id)) if session_id else None
                now = datetime.now(timezone.utc)
                if not access or access.organization_id != organization_uuid or access.actor_id != requester_uuid or access.revoked_at is not None or access.expires_at <= now:
                    raise ValueError("Privileged access expired before sensitive export generation.")
            event_query = db.query(Event.id).filter(Event.organization_id == organization_uuid)
            if export.event_id: event_query = event_query.filter(Event.id == export.event_id)
            event_ids = [row[0] for row in event_query.all()]
            records: list[dict] = []
            def add(domain: str, resource_type: str, resource_id, scoped_event_id, title, status_value, details: dict, occurred_at):
                records.append({"domain": domain, "resource_type": resource_type, "resource_id": resource_id, "event_id": scoped_event_id, "title": title, "status": status_value, "details": json.dumps(details, default=str, separators=(",", ":")), "occurred_at": occurred_at})
            if "events" in domains:
                for row in db.query(Event).filter(Event.id.in_(event_ids)).limit(250_000): add("events", "event", row.id, row.id, row.name, row.status, {"short_code": row.short_code, "start_date": row.start_date, "end_date": row.end_date}, row.updated_at)
            if "speakers" in domains:
                for row in db.query(Speaker).filter(Speaker.event_id.in_(event_ids), Speaker.deleted_at.is_(None)).limit(250_000): add("speakers", "speaker", row.id, row.event_id, f"{row.first_name} {row.last_name}" if include_sensitive else f"{row.first_name[:1]}*** {row.last_name[:1]}***", row.upload_status, {"email": row.email if include_sensitive else None, "phone": row.phone if include_sensitive else None, "affiliation": row.affiliation}, row.updated_at)
            if "sessions" in domains:
                for row in db.query(Session).filter(Session.event_id.in_(event_ids), Session.deleted_at.is_(None)).limit(250_000): add("sessions", "session", row.id, row.event_id, row.name, row.status, {"session_code": row.session_code, "start_time": row.start_time, "end_time": row.end_time, "room_id": row.room_id}, row.updated_at)
            if "registrations" in domains:
                for row in db.query(ParticipantRegistration).filter(ParticipantRegistration.event_id.in_(event_ids), ParticipantRegistration.deleted_at.is_(None)).limit(250_000):
                    source = row.registration_data or {}; safe = source if include_sensitive else {key: value for key, value in source.items() if key not in {"name", "first_name", "last_name", "email", "phone", "address", "custom_fields"}}
                    add("registrations", "registration", row.id, row.event_id, str(source.get("name", "Registration")) if include_sensitive else "Masked registration", row.registration_status, safe, row.updated_at)
            if "files" in domains:
                for row in db.query(PresentationFile).filter(PresentationFile.event_id.in_(event_ids), PresentationFile.deleted_at.is_(None)).limit(250_000): add("files", "presentation_file", row.id, row.event_id, row.original_filename, row.upload_status, {"file_size_bytes": row.file_size_bytes, "file_format": row.file_format, "is_locked": row.is_locked}, row.updated_at)
            if "campaigns" in domains:
                for row in db.query(EmailCampaign).filter(EmailCampaign.event_id.in_(event_ids), EmailCampaign.deleted_at.is_(None)).limit(250_000): add("campaigns", "email_campaign", row.id, row.event_id, row.name, row.status, {"target_type": row.target_type, "total_recipients": row.total_recipients, "sent_count": row.sent_count}, row.updated_at)
            if "payments" in domains:
                for row in db.query(PaymentTransaction).filter(PaymentTransaction.event_id.in_(event_ids)).limit(250_000): add("payments", "payment", row.id, row.event_id, "Payment transaction", row.status, {"amount": row.amount, "currency": row.currency, "payment_method": row.payment_method, "gateway_payment_id": row.gateway_payment_id if include_sensitive else None}, row.updated_at)
            if "users" in domains:
                for assignment, user in db.query(UserEventAssignment, User).join(User, User.id == UserEventAssignment.user_id).filter(User.organization_id == organization_uuid, UserEventAssignment.event_id.in_(event_ids)).limit(250_000): add("users", "user_event_assignment", assignment.id, assignment.event_id, f"{user.first_name or ''} {user.last_name or ''}".strip() if include_sensitive else "Masked user", "active", {"user_id": user.id, "email": user.email if include_sensitive else None, "permissions": assignment.permissions}, assignment.assigned_at)
            if "audit" in domains:
                for row in db.query(AuditLog).filter(AuditLog.organization_id == organization_uuid).order_by(AuditLog.occurred_at.desc()).limit(250_000): add("audit", row.resource_type, row.resource_id or row.id, None, row.action_type, "recorded", {"actor_user_id": row.actor_user_id, "actor_role": row.actor_role, "is_sensitive": row.is_sensitive}, row.occurred_at)

        columns = ["domain", "resource_type", "resource_id", "event_id", "title", "status", "details", "occurred_at"]
        stream = io.StringIO(newline=""); writer = csv.DictWriter(stream, fieldnames=columns, lineterminator="\n"); writer.writeheader()
        for record in sorted(records, key=lambda item: str(item.get("occurred_at") or ""), reverse=True): writer.writerow({column: _cell_value(record.get(column)) for column in columns})
        artifact = stream.getvalue().encode("utf-8-sig")
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        storage_key = f"{organization_uuid}/organization-console-exports/console_{export_uuid}_{timestamp}.csv"
        r2.upload_bytes(bucket=settings.S3_BUCKET_EXPORTS, key=storage_key, data=artifact, content_type="text/csv; charset=utf-8")
        expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
        _set_export_status(organization_uuid, export_uuid, status="COMPLETED", storage_key=storage_key, expires_at=expires_at)
        return {"generated": True, "export_id": str(export_uuid), "row_count": len(records)}
    except Exception as exc:
        logger.exception("[report] Organization Console export failed")
        _set_export_status(organization_uuid, export_uuid, status="FAILED", failure_reason=str(exc)[:1000])
        if self.request.retries < self.max_retries: raise self.retry(exc=exc)
        raise


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
                    <p>Please return to Event OS to download it securely. The export expires in 24 hours.</p>
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


@app.task(
    bind=True,
    name="workers.tasks.report_tasks.generate_quote_proposal_pdf",
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_kwargs={"max_retries": 2},
    soft_time_limit=180,
)
def generate_quote_proposal_pdf(
    self,
    organization_id: str,
    proposal_id: str,
    proposal_version_id: str,
    requested_by_user_id: str,
    export_id: str,
) -> dict:
    organization_uuid = uuid.UUID(organization_id)
    proposal_uuid = uuid.UUID(proposal_id)
    version_uuid = uuid.UUID(proposal_version_id)
    requester_uuid = uuid.UUID(requested_by_user_id)
    export_uuid = uuid.UUID(export_id)
    _set_export_status(organization_uuid, export_uuid, status="RUNNING")

    try:
        with get_db_session(organization_uuid) as db:
            from app.modules.audit.models.audit_domain_tables import DataExport
            from app.modules.crm.models.crm_domain_tables import Proposal, ProposalVersion

            export = db.get(DataExport, export_uuid)
            proposal = db.get(Proposal, proposal_uuid)
            version = db.get(ProposalVersion, version_uuid)
            if (
                export is None or export.organization_id != organization_uuid
                or export.requested_by != requester_uuid or export.source_id != proposal_uuid
                or proposal is None or proposal.organization_id != organization_uuid
                or version is None or version.organization_id != organization_uuid
                or version.proposal_id != proposal_uuid or version.version != export.source_version
            ):
                raise ValueError("Proposal document command scope is invalid.")
            snapshot = dict(version.snapshot_json)
            proposal_number = proposal.proposal_number or str(proposal.id)
            event_id = proposal.event_id

        pdf_data = _build_quote_proposal_pdf(snapshot, proposal_number, version.version)
        event_segment = f"events/{event_id}" if event_id else "control-plane"
        storage_key = f"{organization_uuid}/{event_segment}/proposals/{proposal_uuid}/v{version.version}/{proposal_number}.pdf"
        r2.upload_bytes(
            bucket=settings.S3_BUCKET_EXPORTS, key=storage_key,
            data=pdf_data, content_type="application/pdf",
        )
        expires_at = datetime.now(timezone.utc) + timedelta(days=7)
        _set_export_status(
            organization_uuid, export_uuid, status="COMPLETED", event_uuid=event_id,
            storage_key=storage_key, expires_at=expires_at,
        )
        return {
            "generated": True, "proposal_id": proposal_id,
            "proposal_version": version.version, "export_id": export_id,
            "storage_key": storage_key, "expires_at": expires_at.isoformat(),
        }
    except Exception as exc:
        _set_export_status(
            organization_uuid, export_uuid, status="FAILED", failure_reason=str(exc),
        )
        raise


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
