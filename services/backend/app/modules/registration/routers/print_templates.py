# backend/app/routers/print_templates.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, get_current_user
from app.modules.identity.models.user import User
from datetime import datetime, timezone
from app.modules.registration.models.print_template import PrintTemplate
from app.modules.registration.schemas.print_template import (
    PrintTemplateCreate, PrintTemplateUpdate, PrintTemplateResponse
)
from app.schemas.common import MessageResponse
from app.core.dependencies.feature_gate import enforce_event_operation
from app.modules.audit.services.audit_service import AuditContext, AuditService
from app.modules.billing.services.usage_reservation_service import UsageReservationService
from app.modules.events.services.event_template_mutation_service import (
    EventTemplateMutationService,
)

router = APIRouter(prefix="/events/{event_id}/print-templates", tags=["print-templates"])


async def _enforce_template_operation(
    db: AsyncSession,
    event: CurrentEvent,
    template_type: str,
    actor_id: uuid.UUID,
) -> tuple[str, str]:
    if template_type == "certificate":
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "certificates.templates.manage",
            user_id=actor_id,
        )
        return "certificates.templates.manage", "max_certificate_templates"
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "badges.templates.manage",
        user_id=actor_id,
    )
    return "badges.templates.manage", "max_badge_templates"


def _contains_qr_element(value: object) -> bool:
    """Detect an explicit QR element without treating arbitrary copy as a gate."""
    if isinstance(value, dict):
        element_type = str(
            value.get("type")
            or value.get("element_type")
            or value.get("kind")
            or ""
        ).strip().lower().replace("_", "").replace("-", "")
        if element_type in {"qr", "qrcode"}:
            return True
        return any(_contains_qr_element(item) for item in value.values())
    if isinstance(value, list):
        return any(_contains_qr_element(item) for item in value)
    return False


async def _enforce_template_design_operations(
    db: AsyncSession,
    event: CurrentEvent,
    template_type: str,
    template_data: object,
    actor_id: uuid.UUID,
) -> None:
    if template_type == "certificate":
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "certificates.custom_design.manage",
            user_id=actor_id,
        )
        return
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "badges.custom_design.manage",
        user_id=actor_id,
    )
    if _contains_qr_element(template_data):
        await enforce_event_operation(
            db,
            event.organization_id,
            event.id,
            "badges.qr.manage",
            user_id=actor_id,
        )


@router.get("", response_model=List[PrintTemplateResponse])
async def list_print_templates(
    event: CurrentEvent,
    template_type: Optional[str] = Query(None, pattern="^(badge|card|certificate|custom)$"),
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> List[PrintTemplateResponse]:
    allowed_types: list[str] = []
    requested = [template_type] if template_type else ["badge", "certificate"]
    for requested_type in requested:
        try:
            if requested_type == "certificate":
                await enforce_event_operation(
                    db,
                    event.organization_id,
                    event.id,
                    "certificates.templates.read",
                    user_id=actor.id,
                )
            else:
                await enforce_event_operation(
                    db,
                    event.organization_id,
                    event.id,
                    "badges.templates.read",
                    user_id=actor.id,
                )
        except HTTPException as exc:
            if exc.status_code not in {402, 403}:
                raise
            continue
        allowed_types.extend(
            ["certificate"] if requested_type == "certificate" else ["badge", "card", "custom"]
        )
    if not allowed_types:
        raise HTTPException(
            status_code=403,
            detail={"code": "NOT_ENTITLED", "feature": "print_templates"},
        )
    q = select(PrintTemplate).where(PrintTemplate.event_id == event.id, PrintTemplate.deleted_at.is_(None))
    q = q.where(PrintTemplate.template_type.in_(allowed_types))
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("/certificate-generation-authorizations", status_code=status.HTTP_201_CREATED)
async def authorize_certificate_generation(
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    participant_count: int = Query(..., ge=1, le=10000),
    db: AsyncSession = Depends(get_db),
) -> dict:
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "certificates.generate",
        user_id=actor.id,
    )
    await enforce_event_operation(
        db,
        event.organization_id,
        event.id,
        "exports.create",
        user_id=actor.id,
    )
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="max_exports_per_event",
        quantity=1,
        unit="export",
        idempotency_key=f"certificate-generation:{idempotency_key}",
        metadata={"participant_count": participant_count, "export_type": "certificates"},
    )
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.certificates.generate",
        actor_user_id=actor.id,
    )
    await AuditService.write_log_sync(
        AuditContext(
            action_type="CERTIFICATE_GENERATION_AUTHORIZED",
            resource_type="event",
            resource_id=event.id,
            actor_user_id=actor.id,
            organization_id=event.organization_id,
            actor_role=actor.role,
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


@router.post("", response_model=PrintTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_print_template(
    payload: PrintTemplateCreate,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> PrintTemplateResponse:
    template = await EventTemplateMutationService.create_print(
        db,
        event=event,
        payload=payload,
        actor_user_id=actor.id,
        idempotency_key=idempotency_key,
        source="organizer_portal",
    )
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/{template_id}", response_model=PrintTemplateResponse)
async def get_print_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PrintTemplateResponse:
    q = select(PrintTemplate).where(PrintTemplate.id == template_id, PrintTemplate.event_id == event.id, PrintTemplate.deleted_at.is_(None))
    result = await db.execute(q)
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Print template not found.")
    return template


@router.patch("/{template_id}", response_model=PrintTemplateResponse)
async def update_print_template(
    template_id: uuid.UUID,
    payload: PrintTemplateUpdate,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=200),
    db: AsyncSession = Depends(get_db),
) -> PrintTemplateResponse:
    template, _, _ = await EventTemplateMutationService.update_print(
        db,
        event=event,
        template_id=template_id,
        payload=payload,
        actor_user_id=actor.id,
        idempotency_key=idempotency_key,
        source="organizer_portal",
    )
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", response_model=MessageResponse)
async def delete_print_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    _, outcome = await EventTemplateMutationService.archive_print(
        db,
        event=event,
        template_id=template_id,
        actor_user_id=current_user.id,
    )
    await db.commit()
    return MessageResponse(
        message=(
            "Print template is already archived."
            if outcome == "ALREADY_ARCHIVED"
            else "Print template archived and remains recoverable."
        )
    )


@router.post("/{template_id}/restore", response_model=PrintTemplateResponse)
async def restore_print_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    actor: User = Depends(get_current_user),
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    db: AsyncSession = Depends(get_db),
) -> PrintTemplateResponse:
    template, _ = await EventTemplateMutationService.restore_print(
        db,
        event=event,
        template_id=template_id,
        actor_user_id=actor.id,
        idempotency_key=idempotency_key,
        source="organizer_portal",
    )
    await db.commit()
    await db.refresh(template)
    return template
