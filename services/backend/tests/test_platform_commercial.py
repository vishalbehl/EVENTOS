import pytest
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from tests.conftest import auth_headers
from app.modules.commercial.services import ServiceCatalogService
from app.modules.inventory.services import InventoryService
from app.modules.pricing.services import PricingService, CostEngineService, MarginEngineService, SimulationService
from app.modules.procurement.services import VendorService
from app.modules.pricing.models import PricingRule, PricingRuleCondition, PricingRuleAction, ServicePricing, TaxRule, CurrencyRate

@pytest.mark.asyncio
async def test_commercial_catalog_service_flow(db: AsyncSession, organization):
    # 1. Create Category
    category = await ServiceCatalogService.create_category(db, "AV Equipment", "Sound and Video systems")
    assert category.name == "AV Equipment"

    # 2. Create Service
    service = await ServiceCatalogService.create_service(
        db=db,
        organization_id=organization.id,
        category_id=category.id,
        service_code="AV-LED-001",
        service_name="Led Wall 4K",
        description="Premium LED display panel",
        unit_type="daily",
        is_internal=False,
        features=["4K resolution", "Curved modular config", "High brightness"]
    )
    assert service.service_code == "AV-LED-001"
    assert service.is_active is True

    # 3. Clone Service
    cloned = await ServiceCatalogService.clone_service(db, service.id)
    assert cloned is not None
    assert cloned.service_name == "Led Wall 4K (Clone)"
    assert cloned.service_code.startswith("AV-LED-001_CLONE_")

    # 4. Search Service
    results = await ServiceCatalogService.search_service(db, organization_id=organization.id, query="Led Wall")
    assert len(results) >= 2

    # 5. Archive Service
    archived = await ServiceCatalogService.archive_service(db, service.id)
    assert archived is True
    
    # Reload and check status
    stmt = select(service.__class__).where(service.__class__.id == service.id)
    reloaded = (await db.execute(stmt)).scalar_one()
    assert reloaded.is_active is False


@pytest.mark.asyncio
async def test_inventory_and_allocation_flow(db: AsyncSession, organization):
    # 1. Create Category
    cat = await InventoryService.create_category(db, "Laptops", "Developer workstations")
    
    # 2. Create Hardware Item
    item = await InventoryService.create_hardware_item(
        db=db,
        organization_id=organization.id,
        category_id=cat.id,
        asset_code="HW-LAP-099",
        name="MacBook Pro M3 Max",
        brand="Apple",
        model="M3 Max 16-inch",
        serial_number="SN-M3MAX-987654",
        purchase_date=datetime.now(timezone.utc),
        purchase_cost=3500.00,
        replacement_cost=3800.00,
        status="AVAILABLE",
        condition="GOOD",
        location="Munich Depot",
        notes="Pre-loaded with developer tooling"
    )
    assert item.asset_code == "HW-LAP-099"
    assert item.status == "AVAILABLE"

    # 3. Reserve Hardware
    reserved = await InventoryService.reserve_hardware(db, item.id)
    assert reserved is True

    # 4. Allocate Hardware
    allocated = await InventoryService.allocate_hardware(
        db=db,
        organization_id=organization.id,
        hardware_id=item.id,
        to_location="Booth 404 (Main Hall)",
        notes="Assigned for main speaker presentation"
    )
    assert allocated is not None
    assert allocated.status == "ALLOCATED"
    assert allocated.location == "Booth 404 (Main Hall)"

    # 5. Return Hardware
    returned = await InventoryService.return_hardware(
        db=db,
        organization_id=organization.id,
        hardware_id=item.id,
        return_location="Munich Depot",
        condition="GOOD",
        notes="Returned after presentation"
    )
    assert returned is not None
    assert returned.status == "AVAILABLE"
    assert returned.location == "Munich Depot"


@pytest.mark.asyncio
async def test_pricing_cost_margin_and_simulation(db: AsyncSession, organization, organizer):
    # Setup test data
    cat = await ServiceCatalogService.create_category(db, "Catering Services", "Event food and beverage")
    service = await ServiceCatalogService.create_service(
        db=db,
        organization_id=organization.id,
        category_id=cat.id,
        service_code="CAT-BUFFET-01",
        service_name="Standard Dinner Buffet",
        unit_type="item"
    )

    # 1. Setup ServicePricing
    pricing = ServicePricing(
        id=uuid.uuid4(),
        service_id=service.id,
        region="Europe",
        currency="USD",
        base_price=50.00,
        minimum_price=40.00,
        maximum_price=100.00,
        cost_price=30.00,
        margin_percentage=40.00,
        tax_code="VAT_20",
        effective_from=datetime.now(timezone.utc) - timedelta(days=1),
        effective_to=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db.add(pricing)

    # 2. Setup TaxRule & CurrencyRate
    tax_rule = TaxRule(
        id=uuid.uuid4(),
        name="EU VAT 20",
        country="Germany",
        tax_rate=20.00,
        tax_code="VAT_20",
        is_active=True
    )
    db.add(tax_rule)

    rate = CurrencyRate(
        id=uuid.uuid4(),
        from_currency="USD",
        to_currency="EUR",
        exchange_rate=0.92,
        updated_at=datetime.now(timezone.utc)
    )
    db.add(rate)

    # 3. Setup Pricing Rules
    rule = PricingRule(
        id=uuid.uuid4(),
        organization_id=organization.id,
        name="Large Group Discount",
        code="RULE-GRP-DSC",
        description="Applied if group exceeds 500 attendees",
        status="ACTIVE",
        effective_from=datetime.now(timezone.utc) - timedelta(days=1),
        effective_to=datetime.now(timezone.utc) + timedelta(days=30),
        priority=10
    )
    db.add(rule)
    await db.flush()

    cond = PricingRuleCondition(
        id=uuid.uuid4(),
        rule_id=rule.id,
        field_name="attendees",
        operator=">",
        value="500",
        logical_operator="AND"
    )
    db.add(cond)

    action = PricingRuleAction(
        id=uuid.uuid4(),
        rule_id=rule.id,
        action_type="PERCENTAGE_DISCOUNT",
        value=10.00
    )
    db.add(action)
    await db.flush()

    # 4. Price Calculation Test
    calc_res = await PricingService.calculate_price(
        db=db,
        organization_id=organization.id,
        service_id=service.id,
        region="Europe",
        currency="EUR",
        quantity=600,
        input_data={"attendees": 600}
    )
    assert calc_res["base_unit_price"] == 50.00
    # Group discount 10% on 30,000 base total = 27,000 adjusted + 20% tax = 32,400 final USD
    assert calc_res["adjusted_price"] == 27000.00
    assert calc_res["tax_amount"] == 5400.00
    assert calc_res["final_price_usd"] == 32400.00
    assert calc_res["final_price_converted"] == 32400.00 * 0.92

    # 5. Cost Engine & Margin Engine Test
    cost_res = await CostEngineService.calculate_project_cost(
        db=db,
        services_list=[{"service_id": service.id, "quantity": 100}],
        staff_list=[],
        equipment_list=[]
    )
    assert cost_res["services_cost"] == 3000.00 # 100 * 30.00 cost price

    margin_res = await MarginEngineService.validate_margin(
        db=db,
        organization_id=organization.id,
        cost=3000.00,
        price=5000.00, # 100 * 50.00 base unit price
        discount_amount=500.00
    )
    # net price = 4500, cost = 3000. margin = 1500 / 4500 = 33.33%
    assert margin_res["actual_margin"] == pytest.approx(33.33, 0.1)
    assert margin_res["approved"] is True

    # 6. Pricing Simulation Test
    sim = await SimulationService.simulate_pricing(
        db=db,
        organization_id=organization.id,
        user_id=organizer.id,
        name="Summer Gala Buffet Quotation",
        input_data={
            "attendees": 100,
            "region": "Europe",
            "services": [{"service_id": str(service.id), "quantity": 100}]
        }
    )
    assert sim.name == "Summer Gala Buffet Quotation"
    assert sim.output_data["total_price"] == 6000.00 # 5000 + 20% tax


@pytest.mark.asyncio
async def test_vendors_directory_and_comparison(db: AsyncSession, organization):
    # 1. Create Service
    cat = await ServiceCatalogService.create_category(db, "Staging", "Event staging and booths")
    service = await ServiceCatalogService.create_service(db, organization.id, cat.id, "STG-BASE-01", "Stage Setup Basic")

    # 2. Create Vendors
    v1 = await VendorService.create_vendor(
        db=db,
        name="Exhibits Ltd",
        type="services",
        country="Germany",
        city="Frankfurt",
        email="info@exhibits.de",
        rating=4.5
    )
    v2 = await VendorService.create_vendor(
        db=db,
        name="StageCrafters",
        type="services",
        country="Germany",
        city="Berlin",
        email="hello@stagecrafters.com",
        rating=4.8
    )

    # 3. Assign Vendor Service costs
    await VendorService.assign_vendor(db, vendor_id=v1.id, service_id=service.id, cost=2500.00)
    await VendorService.assign_vendor(db, vendor_id=v2.id, service_id=service.id, cost=2200.00)

    # 4. Compare Vendors
    comparison = await VendorService.compare_vendors(db, service.id)
    assert len(comparison) == 2
    # Ranks by cost ascending first
    assert comparison[0]["vendor_name"] == "StageCrafters"
    assert comparison[0]["cost"] == 2200.00
    assert comparison[1]["vendor_name"] == "Exhibits Ltd"
    assert comparison[1]["cost"] == 2500.00


@pytest.mark.asyncio
async def test_commercial_pricing_api_endpoints(client: AsyncClient, organizer):
    headers = auth_headers(organizer)

    # 1. Create Service Category
    cat_payload = {"name": "Video Hardware", "description": "Visual projection items"}
    res = await client.post("/commercial/categories", json=cat_payload, headers=headers)
    assert res.status_code == 200
    cat_id = res.json()["id"]

    # 2. Create Service
    svc_payload = {
        "category_id": cat_id,
        "service_code": "VID-PROJ-8K",
        "service_name": "Epson 8K Visual Projector",
        "description": "Professional 30k lumens projector",
        "unit_type": "daily",
        "is_internal": False
    }
    res = await client.post("/commercial/services", json=svc_payload, headers=headers)
    assert res.status_code == 200
    svc_id = res.json()["id"]

    # 3. Search Services
    res = await client.get(f"/commercial/services?query=Epson", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # 4. Create Pricing Simulation
    sim_payload = {
        "name": "Epson Visuals Simulation",
        "input_data": {
            "region": "India",
            "services": [{"service_id": svc_id, "quantity": 3}],
            "attendees": 150
        }
    }
    res = await client.post("/pricing/simulate", json=sim_payload, headers=headers)
    assert res.status_code == 200
    assert res.json()["name"] == "Epson Visuals Simulation"
