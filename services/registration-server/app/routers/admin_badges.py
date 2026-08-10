from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict
import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_database
from app.routers.auth import require_admin
from app.models.print_template import PrintTemplate
from app.models.event import Event

router = APIRouter(prefix="/api/v1/venue/admin/badges", tags=["admin_badges"])

class BadgeResponse(BaseModel):
    id: str
    template_name: str
    template_type: str
    template_data: Dict

@router.get("/", response_model=List[BadgeResponse])
async def list_badges(db: AsyncSession = Depends(get_database), _=Depends(require_admin)):
    result = await db.execute(select(PrintTemplate).order_by(PrintTemplate.template_name))
    templates = result.scalars().all()
    return [
        BadgeResponse(
            id=str(t.id),
            template_name=t.template_name,
            template_type=t.template_type,
            template_data=t.template_data
        ) for t in templates
    ]

class BadgeCreate(BaseModel):
    template_name: str
    template_type: str = "custom"
    template_data: Dict

@router.post("/", response_model=BadgeResponse)
async def create_badge(payload: BadgeCreate, db: AsyncSession = Depends(get_database), _=Depends(require_admin)):
    event = (await db.execute(select(Event).limit(1))).scalar_one_or_none()
    
    new_template = PrintTemplate(
        id=uuid.uuid4(),
        event_id=event.id if event else None,
        template_name=payload.template_name,
        template_type=payload.template_type,
        template_data=payload.template_data
    )
    db.add(new_template)
    await db.commit()
    
    return BadgeResponse(
        id=str(new_template.id),
        template_name=new_template.template_name,
        template_type=new_template.template_type,
        template_data=new_template.template_data
    )

@router.delete("/{badge_id}")
async def delete_badge(badge_id: str, db: AsyncSession = Depends(get_database), _=Depends(require_admin)):
    try:
        t_id = uuid.UUID(badge_id)
        template = await db.get(PrintTemplate, t_id)
        if not template:
            raise HTTPException(status_code=404, detail="Template not found")
            
        await db.delete(template)
        await db.commit()
        return {"status": "success"}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid badge ID")
