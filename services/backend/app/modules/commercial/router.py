import uuid
import hashlib
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, File, Header, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.commercial.services import ServiceCatalogService
from app.modules.commercial.schemas import (
    ServiceCreate, ServiceOut, ServicePackageCreate, ServicePackageOut,
    ServiceCategoryCreate, ServiceCategoryOut
)
from app.modules.inventory.models import HardwareCategory, HardwareItem, HardwareStock
from app.modules.superadmin.dependencies import require_super_admin
from sqlalchemy import select, func
from app.core.idempotency_service import begin_idempotent, complete_idempotent, replay_response
from app.modules.platform.application.governed_mutation_commands import commit_transaction
from app.modules.commercial.application.queries import (
    CommercialCatalogQueryService,
    ServiceCatalogQueryService,
)

router = APIRouter(prefix="/commercial", tags=["commercial"])


@router.post("/superadmin/catalog/hardware/import")
async def superadmin_import_hardware(
    file: "UploadFile" = File(...),
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key", min_length=8, max_length=255),
):
    """Bounded, tenant-aware hardware catalog upsert."""
    import io
    import openpyxl

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (max 20 MB).")
    idempotency_record = None
    if idempotency_key:
        idempotency_record = await begin_idempotent(
            db,
            organization_id=current_user.organization_id,
            actor_id=current_user.id,
            operation="commercial.hardware_catalog_import",
            key=idempotency_key,
            payload={
                "filename": file.filename or "",
                "size_bytes": len(contents),
                "sha256": hashlib.sha256(contents).hexdigest(),
            },
        )
        replay = replay_response(idempotency_record)
        if replay is not None:
            return replay[1]
    try:
        sheet = openpyxl.load_workbook(io.BytesIO(contents), data_only=True, read_only=True).active
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid Excel file.") from exc
    headers = {str(cell.value).strip().lower().replace("_", " "): idx for idx, cell in enumerate(next(sheet.iter_rows())) if cell.value}
    def value(row, *names, default=None):
        for name in names:
            idx = headers.get(name)
            if idx is not None and idx < len(row) and row[idx].value is not None:
                return row[idx].value
        return default
    records = []
    for row in sheet.iter_rows(min_row=2, max_row=10001):
        code = str(value(row, "hardware code", "asset code", "code", default="")).strip()
        if not code:
            continue
        category_name = str(value(row, "category", default="General")).strip()
        data = dict(category_id=None, asset_code=code,
                    name=str(value(row, "hardware name", "name", default=code)),
                    brand=str(value(row, "brand", default="")), model=str(value(row, "model", default="")),
                    purchase_cost=float(value(row, "cost price", "purchase cost", default=0) or 0),
                    renting_price=float(value(row, "renting price", default=0) or 0),
                    pricing_unit=str(value(row, "pricing unit", default="PER_EVENT")),
                    description=value(row, "description", default=None), tax_category=value(row, "tax category", default=None))
        requested = int(value(row, "inventory count", "quantity", default=1) or 1)
        records.append((category_name, data, requested))

    if not records:
        response = {"status": "success", "count": 0}
        if idempotency_record is not None:
            await complete_idempotent(
                db, idempotency_record, response_status=200, response_body=response
            )
        await commit_transaction(db, organization_id=current_user.organization_id)
        return response

    # Resolve all existing catalog rows in bounded batches. The previous
    # implementation performed three round trips for every spreadsheet row.
    category_names = {category_name.lower() for category_name, _, _ in records}
    category_display_names = {
        category_name.lower(): category_name for category_name, _, _ in records
    }
    categories = list((await db.scalars(
        select(HardwareCategory).where(func.lower(HardwareCategory.name).in_(category_names))
    )).all())
    categories_by_name = {category.name.lower(): category for category in categories}
    for category_name in category_names:
        if category_name not in categories_by_name:
            category = HardwareCategory(name=category_display_names[category_name])
            db.add(category)
            categories_by_name[category_name] = category
    await db.flush()

    codes = {data["asset_code"] for _, data, _ in records}
    items = list((await db.scalars(
        select(HardwareItem).where(HardwareItem.asset_code.in_(codes))
    )).all())
    items_by_code = {item.asset_code: item for item in items}

    for category_name, data, _ in records:
        data["category_id"] = categories_by_name[category_name.lower()].id
        item = items_by_code.get(data["asset_code"])
        if item is None:
            item = HardwareItem(**data, organization_id=current_user.organization_id)
            db.add(item)
            items_by_code[data["asset_code"]] = item
        else:
            for key, val in data.items():
                setattr(item, key, val)
    await db.flush()

    item_ids = [item.id for item in items_by_code.values()]
    stocks = list((await db.scalars(
        select(HardwareStock).where(HardwareStock.hardware_id.in_(item_ids)).with_for_update()
    )).all())
    stocks_by_item = {stock.hardware_id: stock for stock in stocks}
    for _, data, requested in records:
        item = items_by_code[data["asset_code"]]
        stock = stocks_by_item.get(item.id)
        if stock is None:
            stock = HardwareStock(hardware_id=item.id, quantity=requested, reserved_quantity=0, available_quantity=requested)
            db.add(stock)
            stocks_by_item[item.id] = stock
        else:
            stock.quantity = requested
            stock.available_quantity = max(0, requested - stock.reserved_quantity)

    response = {"status": "success", "count": len(records)}
    if idempotency_record is not None:
        # Persist completion atomically with the catalog mutation.
        await complete_idempotent(
            db, idempotency_record, response_status=200, response_body=response
        )
    await commit_transaction(db, organization_id=current_user.organization_id)
    return response


@router.delete("/superadmin/catalog/hardware/{hardware_id}")
async def superadmin_delete_hardware(hardware_id: uuid.UUID, current_user: User = Depends(require_super_admin), db: AsyncSession = Depends(get_db)):
    item = await db.scalar(select(HardwareItem).where(HardwareItem.id == hardware_id))
    if item is None:
        raise HTTPException(status_code=404, detail="Hardware item not found")
    await db.delete(item)
    await commit_transaction(db, organization_id=current_user.organization_id)
    return {"status": "success", "id": str(hardware_id)}

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
        await commit_transaction(db, organization_id=current_user.organization_id)
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
        await commit_transaction(db, organization_id=current_user.organization_id)
        return service
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/services", response_model=List[ServiceOut])
async def search_services(
    category_id: Optional[uuid.UUID] = None,
    query: Optional[str] = None,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100_000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    services = await ServiceCatalogQueryService(db).search_services(
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
        cloned = await ServiceCatalogService.clone_service(
            db=db, service_id=id, organization_id=current_user.organization_id
        )
        if not cloned:
            raise HTTPException(status_code=404, detail="Service not found to clone")
        await commit_transaction(db, organization_id=current_user.organization_id)
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
        success = await ServiceCatalogService.archive_service(
            db=db, service_id=id, organization_id=current_user.organization_id
        )
        if not success:
            raise HTTPException(status_code=404, detail="Service not found or already archived")
        await commit_transaction(db, organization_id=current_user.organization_id)
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
        await commit_transaction(db, organization_id=current_user.organization_id)
        return package
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/packages", response_model=List[ServicePackageOut])
async def get_packages(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100_000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    packages = await ServiceCatalogQueryService(db).list_packages(
        organization_id=org_id,
        limit=limit,
        offset=offset
    )
    return packages


# SUPER ADMIN STAFF CATALOG ENDPOINTS 

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
    return await CommercialCatalogQueryService(db).list_staff(
        search=search,
        status=status,
        skip=skip,
        limit=limit,
    )

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
    await commit_transaction(db, organization_id=current_user.organization_id)
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

    await commit_transaction(db, organization_id=current_user.organization_id)
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

    await commit_transaction(db, organization_id=current_user.organization_id)
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
        await commit_transaction(db, organization_id=current_user.organization_id)
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=f"Failed to delete staff role: {str(e)}")

    return {"status": "success", "message": "Staff role deleted successfully"}
