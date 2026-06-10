# backend/app/routers/printers.py
from __future__ import annotations

import uuid
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent, AdminOrAbove
from app.modules.venue.models.printer import Printer
from app.modules.registration.schemas.badge import PrinterRegister, PrinterResponse

router = APIRouter(prefix="/events/{event_id}/printers", tags=["printers"])


@router.post("/register", response_model=PrinterResponse, status_code=status.HTTP_201_CREATED)
async def register_printer(
    payload: PrinterRegister,
    event: CurrentEvent,
    current_user: AdminOrAbove,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new network or local printer at the event venue.
    """
    printer = Printer(
        name=payload.name,
        ip_address=payload.ip_address,
        location=payload.location,
        status=payload.status
    )
    db.add(printer)
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
    q = select(Printer)
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
    printer = await db.get(Printer, id)
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return printer
