import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.commercial.services import ServiceCatalogService
from app.modules.commercial.schemas import (
    ServiceCreate, ServiceOut, ServicePackageCreate, ServicePackageOut,
    ServiceCategoryCreate, ServiceCategoryOut
)

router = APIRouter(prefix="/commercial", tags=["commercial"])

@router.post("/categories", response_model=ServiceCategoryOut)
async def create_category(
    req: ServiceCategoryCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        category = await ServiceCatalogService.create_category(
            db=db,
            name=req.name,
            description=req.description
        )
        await db.commit()
        return category
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/services", response_model=ServiceOut)
async def create_service(
    req: ServiceCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        service = await ServiceCatalogService.create_service(
            db=db,
            organization_id=org_id,
            category_id=req.category_id,
            service_code=req.service_code,
            service_name=req.service_name,
            description=req.description,
            unit_type=req.unit_type,
            is_internal=req.is_internal,
            features=req.features
        )
        await db.commit()
        return service
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/services", response_model=List[ServiceOut])
async def search_services(
    category_id: Optional[uuid.UUID] = None,
    query: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    services = await ServiceCatalogService.search_service(
        db=db,
        organization_id=org_id,
        category_id=category_id,
        query=query,
        limit=limit,
        offset=offset
    )
    return services

@router.post("/services/{id}/clone", response_model=ServiceOut)
async def clone_service(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        cloned = await ServiceCatalogService.clone_service(db=db, service_id=id)
        if not cloned:
            raise HTTPException(status_code=404, detail="Service not found to clone")
        await db.commit()
        return cloned
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.delete("/services/{id}")
async def archive_service(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    try:
        success = await ServiceCatalogService.archive_service(db=db, service_id=id)
        if not success:
            raise HTTPException(status_code=404, detail="Service not found or already archived")
        await db.commit()
        return {"status": "success", "message": "Service archived"}
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/packages", response_model=ServicePackageOut)
async def create_package(
    req: ServicePackageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        services_dict = [{"service_id": s.service_id, "quantity": s.quantity} for s in req.services]
        package = await ServiceCatalogService.create_package(
            db=db,
            organization_id=org_id,
            package_name=req.package_name,
            package_code=req.package_code,
            description=req.description,
            price=req.price,
            services=services_dict
        )
        await db.commit()
        return package
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/packages", response_model=List[ServicePackageOut])
async def get_packages(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    packages = await ServiceCatalogService.get_packages(
        db=db,
        organization_id=org_id,
        limit=limit,
        offset=offset
    )
    return packages
