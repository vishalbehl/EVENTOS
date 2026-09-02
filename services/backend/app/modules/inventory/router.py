from __future__ import annotations

import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db
from app.modules.identity.models.user import User
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.inventory.application.commands import InventoryCommandService

router = APIRouter(prefix="/inventory", tags=["inventory"])


@router.post("/superadmin/catalog/hardware/import")
async def import_hardware(file: UploadFile = File(...), current_user: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    contents = await file.read()
    count = await InventoryCommandService(db).import_hardware(
        contents=contents,
        organization_id=current_user.organization_id,
    )
    return {"status": "success", "count": count}


@router.delete("/superadmin/catalog/hardware/{hardware_id}")
async def delete_hardware(hardware_id: uuid.UUID, _: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    await InventoryCommandService(db).delete_hardware(hardware_id=hardware_id)
    return {"status": "success", "id": str(hardware_id)}
