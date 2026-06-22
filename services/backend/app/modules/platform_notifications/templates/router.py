from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from .dependencies import get_db
from .service import TemplatesService
import uuid

router = APIRouter(prefix="/templates", tags=["templates"])

@router.post("")
async def create_template(org_id: uuid.UUID, event_id: uuid.UUID, channel: str, name: str, subject: str, body: str, variables: dict = None, db: AsyncSession = Depends(get_db)):
    srv = TemplatesService(db)
    tmpl = await srv.create_template(org_id, event_id, channel, name, subject, body, variables)
    await db.commit()
    return tmpl

@router.get("")
async def list_templates(org_id: uuid.UUID = None, db: AsyncSession = Depends(get_db)):
    srv = TemplatesService(db)
    return await srv.list_templates(org_id)

@router.get("/{template_id}")
async def get_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = TemplatesService(db)
    tmpl = await srv.get_template(template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl

@router.put("/{template_id}")
async def update_template(template_id: uuid.UUID, updates: dict, db: AsyncSession = Depends(get_db)):
    srv = TemplatesService(db)
    tmpl = await srv.update_template(template_id, updates)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.commit()
    return tmpl

@router.delete("/{template_id}")
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    srv = TemplatesService(db)
    success = await srv.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.commit()
    return {"status": "success"}
