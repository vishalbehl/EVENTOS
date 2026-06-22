import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.templates.services import TemplateService
from app.modules.templates.schemas import (
    TemplateOut, TemplateCreate, TemplateVersionOut, TemplateVersionCreate, TemplateInstallationOut, TemplateInstallationCreate
)
from app.modules.templates.models import Template

router = APIRouter(prefix="/templates", tags=["Templates"])

@router.get("", response_model=List[TemplateOut])
async def list_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    result = await db.execute(select(Template))
    return list(result.scalars().all())

@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
async def create_template(
    payload: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    data = payload.model_dump()
    data["organization_id"] = current_user.organization_id
    return await TemplateService.create_template(db, data, created_by=current_user.id)

@router.patch("/{id}", response_model=TemplateOut)
async def update_template(
    id: uuid.UUID,
    payload: TemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    template = await db.get(Template, id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    if payload.name:
        template.name = payload.name
    if payload.description:
        template.description = payload.description
    if payload.status:
        template.status = payload.status
    if payload.visibility:
        template.visibility = payload.visibility

    await db.commit()
    return template

@router.delete("/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    template = await db.get(Template, id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
    await db.commit()

@router.post("/{id}/clone", response_model=TemplateOut)
async def clone_template(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        return await TemplateService.clone_template(db, id, organization_id=current_user.organization_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/{id}/publish", response_model=TemplateVersionOut)
async def publish_template(
    id: uuid.UUID,
    payload: TemplateVersionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        return await TemplateService.publish_template(db, id, payload.model_dump(), published_by=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/install", response_model=TemplateInstallationOut)
async def install_template(
    payload: TemplateInstallationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        return await TemplateService.install_template(db, current_user.organization_id, payload.event_id, payload.template_id, payload.version_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


