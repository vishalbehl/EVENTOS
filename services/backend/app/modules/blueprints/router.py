import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.blueprints.services import BlueprintService
from app.modules.blueprints.schemas import EventBlueprintOut, EventBlueprintCreate, BlueprintInstallationOut, BlueprintInstallationCreate
from app.modules.blueprints.models import EventBlueprint

router = APIRouter(prefix="/blueprints", tags=["Blueprints"])

@router.get("", response_model=List[EventBlueprintOut])
async def list_blueprints(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import select
    result = await db.execute(select(EventBlueprint))
    return list(result.scalars().all())

@router.post("", response_model=EventBlueprintOut, status_code=status.HTTP_201_CREATED)
async def create_blueprint(
    payload: EventBlueprintCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    return await BlueprintService.create_blueprint(db, payload.model_dump())

@router.post("/{id}/install", response_model=BlueprintInstallationOut)
async def install_blueprint(
    id: uuid.UUID,
    payload: BlueprintInstallationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        return await BlueprintService.install_blueprint(db, current_user.organization_id, payload.event_id, id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


