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


# â”€â”€ SUPER ADMIN STAFF CATALOG ENDPOINTS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

import json
from pydantic import BaseModel
from sqlalchemy import func, text, select, and_, or_, case
from datetime import datetime, timezone, timedelta
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.commercial.models import StaffRole

def generate_role_code_py(category: str, name: str) -> str:
    # Map prefix
    cat_lower = category.lower()
    if "ready room" in cat_lower or "srr" in cat_lower:
        prefix = "SRR"
    elif "presentation" in cat_lower or "room" in cat_lower:
        prefix = "ROOM"
    elif "registration" in cat_lower or "check" in cat_lower:
        prefix = "REG"
    elif "it" in cat_lower or "network" in cat_lower:
        prefix = "NET"
    else:
        prefix = "OPS"

    # Map suffix
    name_lower = name.lower()
    if "supervisor" in name_lower:
        suffix = "SVR"
    elif "operator" in name_lower:
        suffix = "OPR"
    elif "technician" in name_lower or "tech" in name_lower:
        suffix = "TEC"
    elif "moderator" in name_lower:
        suffix = "MOD"
    elif "helpdesk" in name_lower:
        suffix = "HD"
    elif "floor" in name_lower:
        suffix = "FLR"
    elif "project manager" in name_lower or "pm" in name_lower:
        suffix = "PM"
    else:
        # fallback to first 3 letters uppercase
        clean_name = "".join(c for c in name if c.isalnum())
        suffix = clean_name[:3].upper() if clean_name else "ROLE"

    return f"{prefix}-{suffix}"

async def seed_staff_if_empty(db: AsyncSession):
    # Seeding disabled as requested by the user
    pass

class SuperAdminStaffCreate(BaseModel):
    name: str
    role_code: Optional[str] = None
    grade: Optional[str] = "L1"
    cost_per_day: float
    selling_per_day: float
    team_category: Optional[str] = None
    department: Optional[str] = None
    available_count: Optional[int] = 10
    status: Optional[str] = "ACTIVE"
    description: Optional[str] = ""

class SuperAdminStaffUpdate(BaseModel):
    name: Optional[str] = None
    cost_per_day: Optional[float] = None
    selling_per_day: Optional[float] = None
    role_code: Optional[str] = None
    grade: Optional[str] = None
    team_category: Optional[str] = None
    department: Optional[str] = None
    available_count: Optional[int] = None
    status: Optional[str] = None
    description: Optional[str] = None

@router.get("/superadmin/catalog/staff")
async def superadmin_get_staff(
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    skip: int = Query(0),
    limit: int = Query(20),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(StaffRole)
    if search:
        stmt = stmt.where(or_(
            StaffRole.role_name.ilike(f"%{search}%"),
            StaffRole.role_code.ilike(f"%{search}%"),
            StaffRole.description.ilike(f"%{search}%")
        ))
    if status:
        stmt = stmt.where(StaffRole.status == status)

    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = (await db.execute(count_stmt)).scalar() or 0

    stmt = stmt.order_by(StaffRole.role_name).offset(skip).limit(limit)
    res = await db.execute(stmt)
    roles = res.scalars().all()

    items = []
    for r in roles:
        margin_pct = ((r.selling_per_day - r.cost_per_day) / r.selling_per_day) * 100 if r.selling_per_day > 0 else 0.0
        items.append({
            "id": str(r.id),
            "role_code": r.role_code,
            "name": r.role_name,
            "description": r.description or "",
            "cost_per_day": float(r.cost_per_day),
            "selling_per_day": float(r.selling_per_day),
            "margin_pct": round(margin_pct, 2),
            "region": "Global",
            "is_active": r.status == "ACTIVE",
            "grade": r.grade,
            "team_category": r.team_category,
            "department": r.team_category,
            "available_count": r.available_count,
            "status": r.status
        })

    # Summary metrics
    sum_stmt = select(
        func.count(StaffRole.id).label("total_roles"),
        func.sum(case((StaffRole.status == "ACTIVE", 1), else_=0)).label("active_roles"),
        func.avg(StaffRole.cost_per_day).label("avg_cost_day"),
        func.avg(StaffRole.selling_per_day).label("avg_selling_day")
    )
    s_res = await db.execute(sum_stmt)
    s = s_res.fetchone()

    summary = {
        "total_roles": s.total_roles or 0,
        "active_roles": s.active_roles or 0,
        "avg_cost_per_day": float(s.avg_cost_day or 0),
        "avg_selling_per_day": float(s.avg_selling_day or 0),
        "total_staff_deployed": 0
    }

    return {"items": items, "total": total, "summary": summary}

@router.post("/superadmin/catalog/staff")
async def superadmin_create_staff(
    body: SuperAdminStaffCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    team_cat = body.team_category or body.department or "General Operations"
    role_code = body.role_code or generate_role_code_py(team_cat, body.name)
    grade_val = body.grade or "L1"

    role = StaffRole(
        id=uuid.uuid4(),
        role_code=role_code,
        role_name=body.name,
        team_category=team_cat,
        grade=grade_val,
        cost_per_day=body.cost_per_day,
        selling_per_day=body.selling_per_day,
        available_count=body.available_count or 10,
        status=body.status or "ACTIVE",
        description=body.description or ""
    )
    db.add(role)
    await db.commit()
    return {"status": "success", "id": str(role.id)}

@router.patch("/superadmin/catalog/staff/{role_id}")
async def superadmin_update_staff(
    role_id: uuid.UUID,
    body: SuperAdminStaffUpdate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    role_stmt = select(StaffRole).where(StaffRole.id == role_id)
    role = (await db.execute(role_stmt)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Staff role not found")

    if body.name is not None:
        role.role_name = body.name
    if body.role_code is not None:
        role.role_code = body.role_code
    elif body.name is not None or body.team_category is not None or body.department is not None:
        current_cat = body.team_category or body.department or role.team_category
        current_name = body.name or role.role_name
        role.role_code = generate_role_code_py(current_cat, current_name)

    if body.team_category is not None:
        role.team_category = body.team_category
    elif body.department is not None:
        role.team_category = body.department

    if body.grade is not None:
        role.grade = body.grade
    if body.cost_per_day is not None:
        role.cost_per_day = body.cost_per_day
    if body.selling_per_day is not None:
        role.selling_per_day = body.selling_per_day
    if body.available_count is not None:
        role.available_count = body.available_count
    if body.status is not None:
        role.status = body.status
    if body.description is not None:
        role.description = body.description

    await db.commit()
    return {"status": "success", "id": str(role_id)}

from fastapi import File, UploadFile

@router.post("/superadmin/catalog/staff/import")
async def superadmin_import_staff(
    file: UploadFile = File(...),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    import io
    import openpyxl

    contents = await file.read()
    try:
        wb = openpyxl.load_workbook(filename=io.BytesIO(contents), data_only=True)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid Excel file: {str(e)}")

    sheet = wb.active
    if sheet.max_row < 2:
        return {"status": "success", "count": 0}

    header_cells = [cell.value for cell in sheet[1]]
    header_map = {}
    for idx, cell in enumerate(header_cells):
        if not cell:
            continue
        val = str(cell).strip().lower().replace("_", " ").replace("-", " ")
        header_map[val] = idx

    def get_val(row_vals, aliases, default=None):
        for alias in aliases:
            a_clean = alias.lower().replace("_", " ").replace("-", " ")
            if a_clean in header_map:
                res = row_vals[header_map[a_clean]]
                if res is not None:
                    return res
        return default

    imported_count = 0
    for r_idx in range(2, sheet.max_row + 1):
        row_vals = [cell.value for cell in sheet[r_idx]]
        if not any(row_vals):
            continue

        name = get_val(row_vals, ["role name", "name", "title", "job title"])
        if not name or not str(name).strip():
            continue

        name_str = str(name).strip()
        team_cat = str(get_val(row_vals, ["team category", "category", "department"], "General Operations")).strip()
        grade = str(get_val(row_vals, ["grade", "level"], "L1")).strip()

        cost_per_day = 0.0
        try:
            cost_per_day = float(get_val(row_vals, ["cost per day", "cost", "day rate", "cost day", "daily cost"], 0.0))
        except ValueError:
            pass

        selling_per_day = 0.0
        try:
            selling_per_day = float(get_val(row_vals, ["selling per day", "selling", "price", "selling day", "daily selling"], 0.0))
        except ValueError:
            pass

        available_count = 10
        try:
            available_count = int(get_val(row_vals, ["availability", "available count", "count", "quantity"], 10))
        except ValueError:
            pass

        status = str(get_val(row_vals, ["status", "active"], "ACTIVE")).strip().upper()
        if status not in ["ACTIVE", "INACTIVE"]:
            status = "ACTIVE"

        role_code = get_val(row_vals, ["role code", "code", "id"])
        role = None

        # First match by role code if provided
        if role_code and str(role_code).strip():
            role_code_str = str(role_code).strip()
            role_stmt = select(StaffRole).where(StaffRole.role_code == role_code_str)
            role = (await db.execute(role_stmt)).scalar_one_or_none()
        else:
            role_code_str = generate_role_code_py(team_cat, name_str)

        # If not matched by code, match by name case-insensitively
        if not role:
            role_stmt = select(StaffRole).where(func.lower(StaffRole.role_name) == name_str.lower())
            role = (await db.execute(role_stmt)).scalar_one_or_none()

        desc = get_val(row_vals, ["description", "info", "notes"], "")

        if role:
            # Safely update role_name if it has changed, ensuring it doesn't collide with another record
            if role.role_name != name_str:
                name_stmt = select(StaffRole).where(func.lower(StaffRole.role_name) == name_str.lower())
                name_exists = (await db.execute(name_stmt)).scalar_one_or_none()
                if not name_exists:
                    role.role_name = name_str
            role.role_code = role_code_str
            role.team_category = team_cat
            role.grade = grade
            role.cost_per_day = cost_per_day
            role.selling_per_day = selling_per_day
            role.available_count = available_count
            role.status = status
            role.description = str(desc) if desc else ""
        else:
            role = StaffRole(
                id=uuid.uuid4(),
                role_code=role_code_str,
                role_name=name_str,
                team_category=team_cat,
                grade=grade,
                cost_per_day=cost_per_day,
                selling_per_day=selling_per_day,
                available_count=available_count,
                status=status,
                description=str(desc) if desc else ""
            )
            db.add(role)

        imported_count += 1

    await db.commit()
    return {"status": "success", "count": imported_count}

@router.delete("/superadmin/catalog/staff/{role_id}")
async def superadmin_delete_staff(
    role_id: uuid.UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    role_stmt = select(StaffRole).where(StaffRole.id == role_id)
    role = (await db.execute(role_stmt)).scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Staff role not found")

    try:
        await db.delete(role)
        await db.commit()
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to delete staff role: {str(e)}")

    return {"status": "success", "message": "Staff role deleted successfully"}
