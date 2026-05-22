# backend/app/routers/print_templates.py
from __future__ import annotations

import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, get_current_event, CurrentEvent
from app.models.print_template import PrintTemplate
from app.schemas.print_template import (
    PrintTemplateCreate, PrintTemplateUpdate, PrintTemplateResponse
)
from app.schemas.common import MessageResponse

router = APIRouter(prefix="/events/{event_id}/print-templates", tags=["print-templates"])


@router.get("", response_model=List[PrintTemplateResponse])
async def list_print_templates(
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> List[PrintTemplateResponse]:
    q = select(PrintTemplate).where(PrintTemplate.event_id == event.id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.post("", response_model=PrintTemplateResponse, status_code=status.HTTP_201_CREATED)
async def create_print_template(
    payload: PrintTemplateCreate,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PrintTemplateResponse:
    template = PrintTemplate(
        event_id=event.id,
        template_name=payload.template_name,
        template_type=payload.template_type,
        template_data=payload.template_data,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.get("/{template_id}", response_model=PrintTemplateResponse)
async def get_print_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> PrintTemplateResponse:
    q = select(PrintTemplate).where(PrintTemplate.id == template_id, PrintTemplate.event_id == event.id)
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
    db: AsyncSession = Depends(get_db),
) -> PrintTemplateResponse:
    q = select(PrintTemplate).where(PrintTemplate.id == template_id, PrintTemplate.event_id == event.id)
    result = await db.execute(q)
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Print template not found.")

    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(template, field, value)

    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", response_model=MessageResponse)
async def delete_print_template(
    template_id: uuid.UUID,
    event: CurrentEvent,
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    q = select(PrintTemplate).where(PrintTemplate.id == template_id, PrintTemplate.event_id == event.id)
    result = await db.execute(q)
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Print template not found.")

    await db.delete(template)
    await db.commit()
    return MessageResponse(message="Print template deleted successfully.")
