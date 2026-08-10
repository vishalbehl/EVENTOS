# backend/app/routers/badges.py
from __future__ import annotations

import uuid
import csv
import io
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.registration.models.badge_models import Badge, BadgeHistory, BadgePrintJob
from app.modules.venue.models.printer import Printer
from app.modules.registration.models.participant import Participant
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.schemas.badge import (
    BadgeGenerateRequest,
    BadgeReprintRequest,
    BadgeResponse,
    BadgeHistoryResponse,
    BadgePrintJobResponse,
)
from app.core.dependencies.feature_gate import enforce_event_operation, require_event_operation
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.billing.services.usage_reservation_service import UsageReservationService

router = APIRouter(
    prefix="/events/{event_id}/badges",
    tags=["badges"],
    # Badge generation, printing, and QR rotation are registration-domain
    # operations.  Keep the router-level gate as defence in depth for every
    # mutation; individual export endpoints add their own quota reservation.
    dependencies=[require_event_operation("registration.manage")],
)


@router.post("/export-authorizations", status_code=status.HTTP_201_CREATED)
async def authorize_badge_export(
    event: CurrentEvent,
    current_user: AdminOrAbove,
    participant_count: int = Query(..., ge=1, le=10000),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Authorize and meter a client-side PDF badge compilation."""
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "badges.export",
        user_id=current_user.id,
    )
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="max_exports_per_event",
        quantity=1,
        unit="export",
        idempotency_key=f"badge-pdf-export:{idempotency_key}",
        metadata={"participant_count": participant_count, "export_type": "badge_pdf"},
    )
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.badges.pdf_export",
        actor_user_id=current_user.id,
    )
    await AuditService.write_log_sync(
        AuditContext(
            action_type="BADGE_EXPORT_AUTHORIZED",
            resource_type="event",
            resource_id=event.id,
            actor_user_id=current_user.id,
            organization_id=event.organization_id,
            actor_role=current_user.role,
            new_state={"participant_count": participant_count},
        ),
        db,
    )
    await db.commit()
    return {
        "authorized": True,
        "reservation_id": str(reservation.id),
        "participant_count": participant_count,
    }


@router.post("/export")
async def export_badge_manifest(
    event: CurrentEvent,
    current_user: AdminOrAbove,
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    """Export an event-scoped badge manifest under the bulk-export gate."""
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "badges.export",
        user_id=current_user.id,
    )
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="max_exports_per_event",
        quantity=1,
        unit="export",
        idempotency_key=f"badge-export:{idempotency_key}",
        metadata={"export_type": "badge_manifest"},
    )
    rows = (
        await db.execute(
            select(Badge, Participant)
            .join(Participant, Participant.id == Badge.participant_id)
            .where(Participant.event_id == event.id)
            .order_by(Participant.regno, Badge.created_at)
        )
    ).all()
    output = io.StringIO(newline="")
    writer = csv.writer(output)
    writer.writerow(
        [
            "badge_id",
            "registration_number",
            "participant_name",
            "participant_email",
            "badge_code",
            "barcode",
            "status",
            "issued_at",
        ]
    )
    for badge, participant in rows:
        writer.writerow(
            [
                badge.id,
                participant.regno,
                participant.name,
                participant.email,
                badge.badge_code,
                badge.barcode,
                badge.status,
                badge.issued_at.isoformat() if badge.issued_at else "",
            ]
        )
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.badges.export",
        actor_user_id=current_user.id,
    )
    await AuditService.write_log_sync(
        AuditContext(
            action_type="BADGE_EXPORT_REQUESTED",
            resource_type="event",
            resource_id=event.id,
            actor_user_id=current_user.id,
            organization_id=event.organization_id,
            actor_role=getattr(current_user, "role", None),
            new_state={"record_count": len(rows), "format": "csv"},
        ),
        db,
    )
    await db.commit()
    filename = f"{event.name.replace(' ', '_')[:40]}_badges.csv"
    return StreamingResponse(
        iter([output.getvalue().encode("utf-8-sig")]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/generate", response_model=BadgeResponse, status_code=status.HTTP_201_CREATED)
async def generate_badge(
    payload: BadgeGenerateRequest,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually generate a badge for a participant.
    """
    participant = await db.get(Participant, payload.participant_id)
    if not participant or participant.event_id != event.id:
        raise HTTPException(status_code=404, detail="Participant not found for this event")

    # Check if participant already has a badge
    q_existing = select(Badge).where(Badge.participant_id == participant.id)
    existing = (await db.execute(q_existing)).scalar_one_or_none()
    if existing:
        return existing

    # Find template_id
    template_id = payload.template_id
    if not template_id:
        q_tmpl = select(PrintTemplate).where(
            PrintTemplate.event_id == event.id,
            PrintTemplate.template_type == "badge"
        ).limit(1)
        template = (await db.execute(q_tmpl)).scalar_one_or_none()
        template_id = template.id if template else None

    badge_code = f"BDG-{uuid.uuid4().hex[:8].upper()}"
    qr_token = f"qr_{uuid.uuid4().hex}"
    barcode = f"BC-{uuid.uuid4().hex[:10].upper()}"

    badge = Badge(
        participant_id=participant.id,
        badge_code=badge_code,
        qr_token=qr_token,
        barcode=barcode,
        template_id=template_id,
        status="created"
    )
    db.add(badge)
    await db.flush()

    # Log history
    history = BadgeHistory(
        badge_id=badge.id,
        action="created",
        performed_by=current_user.id,
        metadata={"source": "manual_generation"}
    )
    db.add(history)

    await db.commit()
    await db.refresh(badge)
    return badge


@router.post("/reprint", response_model=BadgePrintJobResponse, status_code=status.HTTP_201_CREATED)
async def reprint_badge(
    payload: BadgeReprintRequest,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Queue a reprint job for an existing badge, specifying the reason (damaged, correction, lost).
    """
    badge = await db.get(Badge, payload.badge_id)
    participant = await db.get(Participant, badge.participant_id) if badge else None
    if not badge or not participant or participant.event_id != event.id:
        raise HTTPException(status_code=404, detail="Badge not found")

    # Verify printer exists
    printer = await db.scalar(select(Printer).where(
        Printer.id == payload.printer_id,
        Printer.organization_id == event.organization_id,
        Printer.event_id == event.id,
        Printer.retired_at.is_(None),
    ))
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    badge.status = "reprinted"
    
    # Create print job
    job = BadgePrintJob(
        badge_id=badge.id,
        printer_id=printer.id,
        status="queued"
    )
    db.add(job)

    # Log History
    history = BadgeHistory(
        badge_id=badge.id,
        action="reprinted",
        performed_by=current_user.id,
        metadata={"printer_id": str(printer.id), "reason": payload.reason}
    )
    db.add(history)

    await db.commit()
    await db.refresh(job)
    return job


@router.post("/{id}/regenerate-qr", response_model=BadgeResponse)
async def regenerate_qr(
    id: uuid.UUID,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Regenerate a QR token for a badge, invalidating the old QR token for offline validation.
    """
    badge = await db.get(Badge, id)
    participant = await db.get(Participant, badge.participant_id) if badge else None
    if not badge or not participant or participant.event_id != event.id:
        raise HTTPException(status_code=404, detail="Badge not found")

    old_qr = badge.qr_token
    new_qr = f"qr_{uuid.uuid4().hex}"
    badge.qr_token = new_qr

    # Log History
    history = BadgeHistory(
        badge_id=badge.id,
        action="deactivated",
        performed_by=current_user.id,
        metadata={"deactivated_qr": old_qr, "reason": "qr_regeneration"}
    )
    db.add(history)

    await db.commit()
    await db.refresh(badge)
    return badge


@router.get("/history", response_model=List[BadgeHistoryResponse])
async def list_badge_history(
    event: CurrentEvent,
    badge_id: Optional[uuid.UUID] = Query(None, description="Filter history by badge ID"),
    db: AsyncSession = Depends(get_db)
):
    """
    List badge history audit trail records.
    """
    q = select(BadgeHistory).join(Badge).join(Participant).where(
        Participant.event_id == event.id
    )
    if badge_id:
        q = q.where(BadgeHistory.badge_id == badge_id)
    q = q.order_by(BadgeHistory.created_at.desc())

    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("/{id}/print", response_model=BadgePrintJobResponse, status_code=status.HTTP_201_CREATED)
async def print_badge_job(
    id: uuid.UUID,
    printer_id: uuid.UUID,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Directly queue a print job for a badge.
    """
    badge = await db.get(Badge, id)
    participant = await db.get(Participant, badge.participant_id) if badge else None
    if not badge or not participant or participant.event_id != event.id:
        raise HTTPException(status_code=404, detail="Badge not found")

    printer = await db.scalar(select(Printer).where(
        Printer.id == printer_id,
        Printer.organization_id == event.organization_id,
        Printer.event_id == event.id,
        Printer.retired_at.is_(None),
    ))
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")

    job = BadgePrintJob(
        badge_id=badge.id,
        printer_id=printer.id,
        status="queued"
    )
    db.add(job)

    # Log History
    history = BadgeHistory(
        badge_id=badge.id,
        action="printed",
        performed_by=current_user.id,
        metadata={"printer_id": str(printer.id)}
    )
    db.add(history)

    await db.commit()
    await db.refresh(job)
    return job


@router.get("/print-jobs", response_model=List[BadgePrintJobResponse])
async def list_badge_print_jobs(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    List print jobs queued or completed for this event.
    """
    q = select(BadgePrintJob).join(Badge).join(Participant).where(
        Participant.event_id == event.id
    ).order_by(BadgePrintJob.queued_at.desc())

    result = await db.execute(q)
    return list(result.scalars().all())


@router.patch("/print-jobs/{job_id}", response_model=BadgePrintJobResponse)
async def update_print_job_status(
    job_id: uuid.UUID,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    status_update: str = Query(..., description="queued, printing, completed, failed"),
    db: AsyncSession = Depends(get_db)
):
    """
    Update status of a print job. Automatically marks completion time and updates badge status to printed if successful.
    """
    job = await db.get(BadgePrintJob, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Print job not found")

    job.status = status_update
    if status_update == "completed":
        job.printed_at = datetime.now(timezone.utc)
        # Update badge status to printed
        badge = await db.get(Badge, job.badge_id)
        if badge:
            badge.status = "printed"

    await db.commit()
    await db.refresh(job)
    return job


@router.get("", response_model=List[BadgeResponse])
async def list_badges(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    List all badges generated for this event.
    """
    q = select(Badge).join(Participant).where(
        Participant.event_id == event.id
    )
    result = await db.execute(q)
    return list(result.scalars().all())

