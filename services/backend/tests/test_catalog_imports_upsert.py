import io
import uuid
import pytest
import openpyxl
from sqlalchemy import select

from app.modules.inventory.models import HardwareItem, HardwareStock, HardwareCategory
from app.modules.commercial.models import StaffRole
from tests.conftest import auth_headers

@pytest.mark.asyncio
async def test_hardware_catalog_import_upsert(client, db, super_admin):
    # 1. Create initial category and hardware item
    cat = HardwareCategory(id=uuid.uuid4(), name="AV Equipment", description="Sound systems")
    db.add(cat)
    await db.flush()

    item = HardwareItem(
        id=uuid.uuid4(),
        category_id=cat.id,
        asset_code="HW-TEST-001",
        name="Projector Model A",
        brand="Epson",
        model="Powerlite 100",
        purchase_cost=15000.0,
        renting_price=2000.0,
        status="AVAILABLE",
        pricing_unit="PER_EVENT",
        description="Standard projector",
        tax_category="GST_18"
    )
    db.add(item)
    
    stock = HardwareStock(
        id=uuid.uuid4(),
        hardware_id=item.id,
        quantity=5,
        reserved_quantity=2,
        available_quantity=3
    )
    db.add(stock)
    await db.flush()
    await db.commit()

    # 2. Build in-memory Excel workbook for update
    wb = openpyxl.Workbook()
    ws = wb.active
    # Headers
    ws.append(["hardware code", "hardware name", "brand", "model", "category", "cost price", "renting price", "pricing unit", "inventory count", "description", "tax category"])
    # Row with same asset code but updated values (renting price 2000 -> 3000, quantity 5 -> 10, description changed)
    ws.append(["HW-TEST-001", "Projector Model A Updated", "Epson", "Powerlite 100", "AV Equipment", 16000.0, 3000.0, "PER_EVENT", 10, "Updated projector desc", "GST_18"])

    excel_file = io.BytesIO()
    wb.save(excel_file)
    excel_file.seek(0)

    # 3. Post to import endpoint
    res = await client.post(
        "/api/v1/inventory/superadmin/catalog/hardware/import",
        files={"file": ("test_import.xlsx", excel_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={**auth_headers(super_admin), "Idempotency-Key": "hardware-import-test-001"}
    )
    assert res.status_code == 200, res.text
    assert res.json()["count"] == 1

    replay = await client.post(
        "/api/v1/inventory/superadmin/catalog/hardware/import",
        files={"file": ("test_import.xlsx", io.BytesIO(excel_file.getvalue()), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers={**auth_headers(super_admin), "Idempotency-Key": "hardware-import-test-001"}
    )
    assert replay.status_code == 200, replay.text
    assert replay.json() == res.json()

    # 4. Assert values are updated in DB (no new items created, existing updated)
    items_stmt = select(HardwareItem).where(HardwareItem.asset_code == "HW-TEST-001")
    items = (await db.execute(items_stmt)).scalars().all()
    assert len(items) == 1
    updated_item = items[0]
    assert updated_item.name == "Projector Model A Updated"
    assert float(updated_item.renting_price) == 3000.0
    assert updated_item.description == "Updated projector desc"
    assert float(updated_item.purchase_cost) == 16000.0

    # Assert stock is updated while preserving reserved quantity
    stock_stmt = select(HardwareStock).where(HardwareStock.hardware_id == updated_item.id)
    updated_stock = (await db.execute(stock_stmt)).scalar_one()
    assert updated_stock.quantity == 10
    assert updated_stock.reserved_quantity == 2
    assert updated_stock.available_quantity == 8 # 10 - 2


@pytest.mark.asyncio
async def test_staff_catalog_import_upsert(client, db, super_admin):
    # 1. Create initial staff role
    role = StaffRole(
        id=uuid.uuid4(),
        role_code="STAFF-TEST-01",
        role_name="AV Tech L1",
        team_category="Technical",
        grade="L1",
        cost_per_day=1500.0,
        selling_per_day=2000.0,
        available_count=4,
        status="ACTIVE",
        description="Junior AV technician"
    )
    db.add(role)
    await db.flush()
    await db.commit()

    # 2. Build in-memory Excel workbook for update
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["role code", "role name", "team category", "grade", "cost per day", "selling per day", "availability", "status", "description"])
    # Row with same code but updated name, prices, grade
    ws.append(["STAFF-TEST-01", "AV Tech L1 Senior", "Technical", "L2", 1800.0, 3000.0, 5, "ACTIVE", "AV technician updated"])

    excel_file = io.BytesIO()
    wb.save(excel_file)
    excel_file.seek(0)

    # 3. Post to import endpoint
    res = await client.post(
        "/api/v1/commercial/superadmin/catalog/staff/import",
        files={"file": ("test_import.xlsx", excel_file, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        headers=auth_headers(super_admin)
    )
    assert res.status_code == 200, res.text
    assert res.json()["count"] == 1

    # 4. Assert values are updated in DB
    roles_stmt = select(StaffRole).where(StaffRole.role_code == "STAFF-TEST-01")
    roles = (await db.execute(roles_stmt)).scalars().all()
    assert len(roles) == 1
    updated_role = roles[0]
    assert updated_role.role_name == "AV Tech L1 Senior"
    assert updated_role.grade == "L2"
    assert float(updated_role.cost_per_day) == 1800.0
    assert float(updated_role.selling_per_day) == 3000.0
    assert updated_role.available_count == 5
    assert updated_role.description == "AV technician updated"


@pytest.mark.asyncio
async def test_hardware_catalog_delete(client, db, super_admin):
    # 1. Create initial category and hardware item
    cat = HardwareCategory(id=uuid.uuid4(), name="AV Equipment Delete", description="Sound systems")
    db.add(cat)
    await db.flush()

    item = HardwareItem(
        id=uuid.uuid4(),
        category_id=cat.id,
        asset_code="HW-DELETE-001",
        name="Projector Model Delete",
        brand="Epson",
        model="Powerlite 100",
        purchase_cost=15000.0,
        renting_price=2000.0,
        status="AVAILABLE",
        pricing_unit="PER_EVENT",
        description="Standard projector",
        tax_category="GST_18"
    )
    db.add(item)
    
    stock = HardwareStock(
        id=uuid.uuid4(),
        hardware_id=item.id,
        quantity=5,
        reserved_quantity=2,
        available_quantity=3
    )
    db.add(stock)
    await db.flush()
    await db.commit()

    # 2. Call DELETE endpoint
    res = await client.delete(
        f"/api/v1/inventory/superadmin/catalog/hardware/{item.id}",
        headers=auth_headers(super_admin)
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "success"

    # 3. Assert deleted in DB
    existing_item = await db.scalar(select(HardwareItem).where(HardwareItem.id == item.id))
    assert existing_item is None
    # Stock should also be cascade deleted
    existing_stock = await db.scalar(select(HardwareStock).where(HardwareStock.hardware_id == item.id))
    assert existing_stock is None


@pytest.mark.asyncio
async def test_staff_catalog_delete(client, db, super_admin):
    # 1. Create initial staff role
    role = StaffRole(
        id=uuid.uuid4(),
        role_code="STAFF-DELETE-01",
        role_name="AV Tech Delete",
        team_category="Technical",
        grade="L1",
        cost_per_day=1500.0,
        selling_per_day=2000.0,
        available_count=4,
        status="ACTIVE",
        description="Junior AV technician"
    )
    db.add(role)
    await db.flush()
    await db.commit()

    # 2. Call DELETE endpoint
    res = await client.delete(
        f"/api/v1/commercial/superadmin/catalog/staff/{role.id}",
        headers=auth_headers(super_admin)
    )
    assert res.status_code == 200, res.text
    assert res.json()["status"] == "success"

    # 3. Assert deleted in DB
    existing_role = await db.scalar(select(StaffRole).where(StaffRole.id == role.id))
    assert existing_role is None
