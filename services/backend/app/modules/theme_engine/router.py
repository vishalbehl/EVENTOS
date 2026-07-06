import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.theme_engine.services import ThemeService
from app.modules.theme_engine.schemas import ThemeOut, ThemeCreate
from app.modules.theme_engine.models import Theme

router = APIRouter(prefix="/themes", tags=["Theme Engine"])

@router.get("", response_model=List[ThemeOut])
async def list_themes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Theme))
    return list(result.scalars().all())

@router.post("", response_model=ThemeOut, status_code=status.HTTP_201_CREATED)
async def create_theme(
    payload: ThemeCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    data = payload.model_dump()
    data["organization_id"] = current_user.organization_id
    return await ThemeService.create_theme(db, data)

@router.post("/{id}/apply", response_model=ThemeOut)
async def apply_theme(
    id: uuid.UUID,
    site_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        await ThemeService.apply_theme(db, id, site_id)
        theme = await db.get(Theme, id)
        if not theme:
            raise HTTPException(status_code=404, detail="Theme not found")
        return theme
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
