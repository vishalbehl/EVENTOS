# backend/app/routers/printers.py
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.venue.models.printer import Printer
from app.modules.registration.schemas.badge import PrinterRegister, PrinterResponse
from app.modules.agenda.models import Room
from app.core.dependencies.feature_gate import require_event_operation
from app.modules.billing.services.usage_reservation_service import UsageReservationService

router = APIRouter(
    prefix="/events/{event_id}/printers",
    tags=["printers"],
    dependencies=[require_event_operation("venue.devices.manage")],
)


@router.post("/register", response_model=PrinterResponse, status_code=status.HTTP_201_CREATED)
async def register_printer(
    payload: PrinterRegister,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    idempotency_key: str = Header(
        ..., alias="Idempotency-Key", min_length=8, max_length=200
    ),
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new network or local printer at the event venue.
    """
    if payload.room_id:
        room = await db.scalar(select(Room).where(
            Room.id == payload.room_id,
            Room.event_id == event.id,
        ))
        if room is None:
            raise HTTPException(status_code=404, detail="Room not found for this event")

    if payload.vendor_id:
        # Vendor validation removed since procurement module is deleted
        pass

    printer_id = uuid.uuid5(
        uuid.NAMESPACE_URL,
        f"eventos:printer:{event.organization_id}:{idempotency_key}",
    )
    existing = await db.get(Printer, printer_id)
    if existing is not None:
        if (
            existing.event_id == event.id
            and existing.name == payload.name
            and existing.ip_address == payload.ip_address
            and existing.location == payload.location
        ):
            return existing
        raise HTTPException(
            status_code=409,
            detail={"code": "IDEMPOTENCY_CONFLICT"},
        )
    reservation = await UsageReservationService.reserve(
        db,
        organization_id=event.organization_id,
        event_id=event.id,
        limit_key="max_devices_per_event",
        quantity=1,
        unit="device",
        idempotency_key=f"printer-register:{idempotency_key}",
        metadata={"printer_id": str(printer_id), "device_type": "printer"},
    )
    printer = Printer(
        id=printer_id,
        organization_id=event.organization_id,
        event_id=event.id,
        vendor_id=payload.vendor_id,
        room_id=payload.room_id,
        external_reference=payload.external_reference,
        deployment_starts_at=payload.deployment_starts_at,
        deployment_ends_at=payload.deployment_ends_at,
        name=payload.name,
        ip_address=payload.ip_address,
        location=payload.location,
        status=payload.status
    )
    db.add(printer)
    await db.flush()
    await UsageReservationService.consume(
        db,
        reservation.id,
        source="organizer_portal.printers.register",
        actor_user_id=current_user.id,
    )
    await db.commit()
    await db.refresh(printer)
    return printer


@router.get("", response_model=List[PrinterResponse])
async def list_printers(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    List all registered printers.
    """
    q = select(Printer).where(
        Printer.organization_id == event.organization_id,
        Printer.event_id == event.id,
        Printer.retired_at.is_(None),
    )
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/{id}", response_model=PrinterResponse)
async def get_printer(
    id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db)
):
    """
    Get a single printer configuration by ID.
    """
    printer = await db.scalar(select(Printer).where(
        Printer.id == id,
        Printer.organization_id == event.organization_id,
        Printer.event_id == event.id,
        Printer.retired_at.is_(None),
    ))
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return printer
