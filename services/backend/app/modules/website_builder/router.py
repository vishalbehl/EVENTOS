import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.website_builder.services import WebsiteBuilderService, PageBuilderService
from app.modules.website_builder.schemas import (
    SiteOut, SiteCreate, PageOut, PageCreate, PageSectionOut, PageSectionCreate, PageComponentOut, SaveDraftRequest
)
from app.modules.website_builder.models import Site, Page

router = APIRouter(prefix="", tags=["Website Builder"])

@router.get("/sites", response_model=List[SiteOut])
async def list_sites(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    result = await db.execute(select(Site))
    return list(result.scalars().all())

@router.post("/sites", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
async def create_site(
    payload: SiteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    data = payload.model_dump()
    data["organization_id"] = current_user.organization_id
    return await WebsiteBuilderService.create_site(db, data)

@router.patch("/sites/{id}", response_model=SiteOut)
async def update_site(
    id: uuid.UUID,
    payload: SiteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    site = await db.get(Site, id)
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")
    if payload.name:
        site.name = payload.name
    if payload.slug:
        site.slug = payload.slug
    if payload.domain:
        site.domain = payload.domain
    await db.commit()
    return site

@router.post("/sites/{id}/publish", response_model=SiteOut)
async def publish_site(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        return await WebsiteBuilderService.publish_site(db, id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/pages", response_model=PageOut, status_code=status.HTTP_201_CREATED)
async def create_page(
    payload: PageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    page = Page(
        id=uuid.uuid4(),
        site_id=payload.site_id,
        name=payload.name,
        slug=payload.slug,
        title=payload.title,
        description=payload.description,
        is_homepage=payload.is_homepage,
        sort_order=payload.sort_order,
        status="DRAFT"
    )
    db.add(page)
    await db.commit()
    return page

@router.patch("/pages/{id}", response_model=PageOut)
async def update_page(
    id: uuid.UUID,
    payload: PageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    page = await db.get(Page, id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    if payload.name:
        page.name = payload.name
    if payload.slug:
        page.slug = payload.slug
    if payload.title:
        page.title = payload.title
    await db.commit()
    return page

@router.delete("/pages/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_page(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    page = await db.get(Page, id)
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await db.delete(page)
    await db.commit()

@router.post("/pages/{id}/draft", response_model=PageOut)
async def save_draft(
    id: uuid.UUID,
    payload: SaveDraftRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        return await PageBuilderService.save_draft(db, id, payload.sections)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.post("/pages/{id}/publish", response_model=PageOut)
async def publish_page(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        return await PageBuilderService.publish_page(db, id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


