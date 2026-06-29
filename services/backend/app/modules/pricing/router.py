import uuid
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.pricing.services import PricingService, SimulationService
from app.modules.pricing.models import PricingSimulation, RevenueForecast
from app.modules.pricing.schemas import (
    PriceCalculateRequest, PriceCalculateResponse,
    PricingSimulationCreate, PricingSimulationOut,
    RevenueForecastOut
)

router = APIRouter(prefix="/pricing", tags=["pricing"])

@router.post("/calculate", response_model=PriceCalculateResponse)
async def calculate_price(
    req: PriceCalculateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        res = await PricingService.calculate_price(
            db=db,
            organization_id=org_id,
            service_id=req.service_id,
            region=req.region,
            currency=req.currency,
            quantity=req.quantity,
            input_data=req.input_data
        )
        return res
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/simulate", response_model=PricingSimulationOut)
async def simulate_pricing(
    req: PricingSimulationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    try:
        sim = await SimulationService.simulate_pricing(
            db=db,
            organization_id=org_id,
            user_id=current_user.id,
            name=req.name,
            input_data=req.input_data
        )
        await db.commit()
        return sim
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/simulations", response_model=List[PricingSimulationOut])
async def get_simulations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    stmt = select(PricingSimulation)
    if org_id:
        stmt = stmt.where(or_(PricingSimulation.organization_id == org_id, PricingSimulation.user_id == current_user.id))
    else:
        stmt = stmt.where(PricingSimulation.user_id == current_user.id)
    
    stmt = stmt.order_by(desc(PricingSimulation.created_at))
    res = await db.execute(stmt)
    return list(res.scalars().all())

@router.delete("/simulations/{simulation_id}")
async def delete_simulation(
    simulation_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PricingSimulation).where(PricingSimulation.id == simulation_id)
    sim = (await db.execute(stmt)).scalar_one_or_none()
    if not sim:
        raise HTTPException(status_code=404, detail="Simulation not found")
    await db.delete(sim)
    await db.commit()
    return {"status": "success", "detail": "Simulation deleted successfully"}

@router.get("/forecast", response_model=List[RevenueForecastOut])
async def get_forecast(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    if not org_id:
        return []
    
    stmt = select(RevenueForecast).where(RevenueForecast.organization_id == org_id).order_by(desc(RevenueForecast.month))
    res = await db.execute(stmt)
    return list(res.scalars().all())


# ── SUPER ADMIN PRICING & TEMPLATES CATALOG ENDPOINTS ─────────────────────────

from pydantic import BaseModel
from sqlalchemy import func, text
from datetime import datetime, timezone, timedelta
import json
from app.modules.superadmin.dependencies import require_super_admin
from app.modules.pricing.models import PricingRule, PricingSimulation

async def seed_pricing_rules_if_empty(db: AsyncSession):
    pass

async def seed_templates_if_empty(db: AsyncSession):
    pass

class SuperAdminPricingRuleCreate(BaseModel):
    name: str
    hardware_markup_pct: float
    staffing_markup_pct: float
    management_fee_pct: float
    contingency_pct: float
    gst_pct: float
    is_default: bool = False
    description: Optional[str] = None

class SuperAdminPricingRuleUpdate(BaseModel):
    name: Optional[str] = None
    hardware_markup_pct: Optional[float] = None
    staffing_markup_pct: Optional[float] = None
    management_fee_pct: Optional[float] = None
    contingency_pct: Optional[float] = None
    gst_pct: Optional[float] = None
    is_default: Optional[bool] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class SelectedHardwareItem(BaseModel):
    hardware_item_id: uuid.UUID
    quantity: int

class SelectedStaffItem(BaseModel):
    staff_role_id: uuid.UUID
    quantity: int
    days: int

class PricingSimulationRunRequest(BaseModel):
    pricing_rule_id: uuid.UUID
    event_city_tier: str
    event_days: int = 1
    attendee_count: int = 0
    room_count: int = 0
    counter_count: int = 0
    srr_stations: int = 0
    selected_hardware: List[SelectedHardwareItem] = []
    selected_staff: List[SelectedStaffItem] = []

@router.get("/superadmin/catalog/pricing-rules")
async def superadmin_get_pricing_rules(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    await seed_pricing_rules_if_empty(db)
    stmt = select(PricingRule).order_by(PricingRule.name)
    res = await db.execute(stmt)
    rules = []
    for r in res.scalars().all():
        is_default = False
        hardware_markup_pct = 15.0
        staffing_markup_pct = 20.0
        management_fee_pct = 10.0
        contingency_pct = 5.0
        gst_pct = 18.0
        clean_desc = r.description
        
        if r.description and r.description.strip().startswith("{"):
            try:
                meta = json.loads(r.description)
                is_default = meta.get("is_default", False)
                hardware_markup_pct = meta.get("hardware_markup_pct", 15.0)
                staffing_markup_pct = meta.get("staffing_markup_pct", 20.0)
                management_fee_pct = meta.get("management_fee_pct", 10.0)
                contingency_pct = meta.get("contingency_pct", 5.0)
                gst_pct = meta.get("gst_pct", 18.0)
                clean_desc = meta.get("description", "")
            except Exception:
                pass
                
        rules.append({
            "id": str(r.id),
            "name": r.name,
            "rule_code": r.code,
            "is_default": is_default,
            "hardware_markup_pct": hardware_markup_pct,
            "staffing_markup_pct": staffing_markup_pct,
            "management_fee_pct": management_fee_pct,
            "contingency_pct": contingency_pct,
            "gst_pct": gst_pct,
            "is_active": r.status == "ACTIVE",
            "status": r.status,
            "description": clean_desc,
            "created_at": r.effective_from.isoformat() if r.effective_from else None,
            "updated_at": r.effective_to.isoformat() if r.effective_to else None
        })
    return rules

@router.get("/superadmin/catalog/pricing-rules/{rule_id}")
async def superadmin_get_pricing_rule_detail(
    rule_id: uuid.UUID,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(PricingRule).where(PricingRule.id == rule_id)
    r = (await db.execute(stmt)).scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Pricing rule not found")
        
    is_default = False
    hardware_markup_pct = 15.0
    staffing_markup_pct = 20.0
    management_fee_pct = 10.0
    contingency_pct = 5.0
    gst_pct = 18.0
    clean_desc = r.description
    
    if r.description and r.description.strip().startswith("{"):
        try:
            meta = json.loads(r.description)
            is_default = meta.get("is_default", False)
            hardware_markup_pct = meta.get("hardware_markup_pct", 15.0)
            staffing_markup_pct = meta.get("staffing_markup_pct", 20.0)
            management_fee_pct = meta.get("management_fee_pct", 10.0)
            contingency_pct = meta.get("contingency_pct", 5.0)
            gst_pct = meta.get("gst_pct", 18.0)
            clean_desc = meta.get("description", "")
        except Exception:
            pass
            
    return {
        "id": str(r.id),
        "name": r.name,
        "rule_code": r.code,
        "is_default": is_default,
        "hardware_markup_pct": hardware_markup_pct,
        "staffing_markup_pct": staffing_markup_pct,
        "management_fee_pct": management_fee_pct,
        "contingency_pct": contingency_pct,
        "gst_pct": gst_pct,
        "is_active": r.status == "ACTIVE",
        "status": r.status,
        "description": clean_desc,
        "created_at": r.effective_from.isoformat() if r.effective_from else None,
        "updated_at": r.effective_to.isoformat() if r.effective_to else None,
        "history": []
    }

@router.post("/superadmin/catalog/pricing-rules")
async def superadmin_create_pricing_rule(
    body: SuperAdminPricingRuleCreate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    if body.is_default:
        stmt = select(PricingRule)
        res = await db.execute(stmt)
        for r in res.scalars().all():
            if r.description and r.description.strip().startswith("{"):
                try:
                    meta = json.loads(r.description)
                    if meta.get("is_default"):
                        meta["is_default"] = False
                        r.description = json.dumps(meta)
                except Exception:
                    pass
                    
    meta = {
        "is_default": body.is_default,
        "hardware_markup_pct": body.hardware_markup_pct,
        "staffing_markup_pct": body.staffing_markup_pct,
        "management_fee_pct": body.management_fee_pct,
        "contingency_pct": body.contingency_pct,
        "gst_pct": body.gst_pct,
        "description": body.description or ""
    }
    
    rule = PricingRule(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        name=body.name,
        code="PR_" + body.name.upper().replace(" ", "_"),
        description=json.dumps(meta),
        status="ACTIVE",
        effective_from=datetime.now(timezone.utc),
        effective_to=datetime.now(timezone.utc) + timedelta(days=365*10),
        priority=0
    )
    db.add(rule)
    await db.commit()
    
    return {"status": "success", "id": str(rule.id)}

@router.patch("/superadmin/catalog/pricing-rules/{rule_id}")
async def superadmin_update_pricing_rule(
    rule_id: uuid.UUID,
    body: SuperAdminPricingRuleUpdate,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    rule_stmt = select(PricingRule).where(PricingRule.id == rule_id)
    rule = (await db.execute(rule_stmt)).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Pricing rule not found")
        
    if body.name is not None:
        rule.name = body.name
    if body.is_active is not None:
        rule.status = "ACTIVE" if body.is_active else "INACTIVE"
        
    if body.is_default:
        stmt = select(PricingRule).where(PricingRule.id != rule_id)
        res = await db.execute(stmt)
        for r in res.scalars().all():
            if r.description and r.description.strip().startswith("{"):
                try:
                    meta = json.loads(r.description)
                    if meta.get("is_default"):
                        meta["is_default"] = False
                        r.description = json.dumps(meta)
                except Exception:
                    pass
                    
    meta = {
        "is_default": False,
        "hardware_markup_pct": 15.0,
        "staffing_markup_pct": 20.0,
        "management_fee_pct": 10.0,
        "contingency_pct": 5.0,
        "gst_pct": 18.0,
        "description": ""
    }
    if rule.description and rule.description.strip().startswith("{"):
        try:
            meta = json.loads(rule.description)
        except Exception:
            meta["description"] = rule.description
            
    if body.is_default is not None:
        meta["is_default"] = body.is_default
    if body.hardware_markup_pct is not None:
        meta["hardware_markup_pct"] = body.hardware_markup_pct
    if body.staffing_markup_pct is not None:
        meta["staffing_markup_pct"] = body.staffing_markup_pct
    if body.management_fee_pct is not None:
        meta["management_fee_pct"] = body.management_fee_pct
    if body.contingency_pct is not None:
        meta["contingency_pct"] = body.contingency_pct
    if body.gst_pct is not None:
        meta["gst_pct"] = body.gst_pct
    if body.description is not None:
        meta["description"] = body.description
        
    rule.description = json.dumps(meta)
    await db.commit()
    
    return {"status": "success", "id": str(rule_id)}

@router.post("/superadmin/catalog/pricing-simulator/run")
async def superadmin_run_simulation(
    body: PricingSimulationRunRequest,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    from app.modules.inventory.models import HardwareItem
    from app.modules.commercial.models import StaffRole
    from sqlalchemy import and_
    
    rule_stmt = select(PricingRule).where(PricingRule.id == body.pricing_rule_id)
    r = (await db.execute(rule_stmt)).scalar_one_or_none()
    
    hardware_markup_pct = 15.0
    staffing_markup_pct = 20.0
    management_fee_pct = 10.0
    contingency_pct = 5.0
    gst_pct = 18.0
    
    if r and r.description and r.description.strip().startswith("{"):
        try:
            meta = json.loads(r.description)
            hardware_markup_pct = meta.get("hardware_markup_pct", 15.0)
            staffing_markup_pct = meta.get("staffing_markup_pct", 20.0)
            management_fee_pct = meta.get("management_fee_pct", 10.0)
            contingency_pct = meta.get("contingency_pct", 5.0)
            gst_pct = meta.get("gst_pct", 18.0)
        except Exception:
            pass
            
    # Calculate Hardware Subtotal
    hardware_subtotal = 0.0
    line_items = []
    
    for item in body.selected_hardware:
        hw_stmt = select(HardwareItem).where(HardwareItem.id == item.hardware_item_id)
        hw = (await db.execute(hw_stmt)).scalar_one_or_none()
        if hw:
            selling_price = float(hw.renting_price or 0)
            line_total = selling_price * item.quantity * body.event_days
            hardware_subtotal += line_total
            line_items.append({
                "name": hw.name,
                "quantity": item.quantity,
                "days": body.event_days,
                "unit_cost": selling_price,
                "total": line_total
            })
            
    # Calculate Staffing Subtotal
    role_res = await db.execute(text("""
        SELECT role_name, selling_per_day
        FROM commercial.staff_roles
    """))
    role_rates = {r.role_name.lower(): float(r.selling_per_day or 0.0) for r in role_res.fetchall()}
    
    room_operator_rate = role_rates.get("room technician", role_rates.get("room operator", 3000.0))
    counter_staff_rate = role_rates.get("registration operator", role_rates.get("check-in operator", 2500.0))
    srr_operator_rate = role_rates.get("srr operator", 3500.0)
    
    staffing_subtotal = 0.0
    if body.room_count > 0:
        room_total = room_operator_rate * body.room_count * body.event_days
        staffing_subtotal += room_total
        line_items.append({
            "name": "Room Operator (Standard Setup)",
            "quantity": body.room_count,
            "days": body.event_days,
            "unit_cost": room_operator_rate,
            "total": room_total
        })
    if body.counter_count > 0:
        counter_total = counter_staff_rate * body.counter_count * body.event_days
        staffing_subtotal += counter_total
        line_items.append({
            "name": "Check-in Operator (Standard Setup)",
            "quantity": body.counter_count,
            "days": body.event_days,
            "unit_cost": counter_staff_rate,
            "total": counter_total
        })
    if body.srr_stations > 0:
        srr_total = srr_operator_rate * body.srr_stations * body.event_days
        staffing_subtotal += srr_total
        line_items.append({
            "name": "SRR Operator (Standard Setup)",
            "quantity": body.srr_stations,
            "days": body.event_days,
            "unit_cost": srr_operator_rate,
            "total": srr_total
        })
        
    # Add custom selected staff roles
    for item in body.selected_staff:
        role_stmt = select(StaffRole).where(StaffRole.id == item.staff_role_id)
        role_row = (await db.execute(role_stmt)).scalar_one_or_none()
        if role_row:
            daily_rate = float(role_row.selling_per_day or 0.0)
            line_total = daily_rate * item.quantity * item.days
            staffing_subtotal += line_total
            line_items.append({
                "name": role_row.role_name,
                "quantity": item.quantity,
                "days": item.days,
                "unit_cost": daily_rate,
                "total": line_total
            })
        
    # Totals
    subtotal = hardware_subtotal + staffing_subtotal
    markup = subtotal * (hardware_markup_pct / 100.0 + staffing_markup_pct / 100.0) / 2.0
    mgmt_fee = subtotal * management_fee_pct / 100.0
    contingency = subtotal * contingency_pct / 100.0
    pre_gst = subtotal + markup + mgmt_fee + contingency
    gst = pre_gst * gst_pct / 100.0
    total = pre_gst + gst
    
    output_data = {
        "hardware_subtotal": hardware_subtotal,
        "staffing_subtotal": staffing_subtotal,
        "markup_fees": markup,
        "management_fee": mgmt_fee,
        "contingency": contingency,
        "pre_gst_total": pre_gst,
        "gst_amount": gst,
        "total_amount": total,
        "line_items": line_items
    }
    
    # Save simulation run
    sim = PricingSimulation(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        user_id=current_user.id,
        name=f"Simulation - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
        input_data=body.model_dump(mode="json"),
        output_data=output_data,
        created_at=datetime.now(timezone.utc)
    )
    db.add(sim)
    await db.commit()
    
    return output_data

@router.get("/superadmin/catalog/templates")
async def superadmin_get_templates(
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    from app.modules.templates.models import RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate
    
    # Get room templates
    room_res = await db.execute(select(RoomTemplate))
    room_templates = []
    for r in room_res.scalars().all():
        room_templates.append({
            "name": r.name,
            "slug": r.slug,
            "description": r.description or "",
            "version": r.version,
            "is_default": r.is_default,
            "is_active": r.status == "ACTIVE",
            "usage_count": r.usage_count,
            "default_capacity": r.default_capacity,
            "room_type": r.room_type,
            "setup_time": float(r.setup_time),
            "teardown_time": float(r.teardown_time),
            "hardware_allocation": r.hardware_allocation or [],
            "staff_allocation": r.staff_allocation or []
        })

    # Get registration templates
    reg_res = await db.execute(select(RegistrationTemplate))
    registration_templates = []
    for r in reg_res.scalars().all():
        registration_templates.append({
            "name": r.name,
            "slug": r.slug,
            "description": r.description or "",
            "version": r.version,
            "is_default": r.is_default,
            "is_active": r.status == "ACTIVE",
            "usage_count": r.usage_count,
            "registration_type": r.registration_type,
            "min_attendees": r.min_attendees,
            "max_attendees": r.max_attendees,
            "recommended_reg_type": r.recommended_reg_type,
            "reg_counters": r.reg_counters,
            "kiosks": r.kiosks,
            "badge_stations": r.badge_stations,
            "qr_stations": r.qr_stations,
            "helpdesk_counters": r.helpdesk_counters,
            "checkins_per_hour": r.checkins_per_hour,
            "badge_per_piece_cost": float(r.badge_per_piece_cost),
            "setup_time": float(r.setup_time),
            "teardown_time": float(r.teardown_time),
            "hardware_allocation": r.hardware_allocation or [],
            "staff_allocation": r.staff_allocation or [],
            "is_single_kiosk": r.is_single_kiosk
        })

    # Get SRR templates
    srr_res = await db.execute(select(SrrTemplate))
    srr_templates = []
    for r in srr_res.scalars().all():
        srr_templates.append({
            "name": r.name,
            "slug": r.slug,
            "description": r.description or "",
            "version": r.version,
            "is_default": r.is_default,
            "is_active": r.status == "ACTIVE",
            "usage_count": r.usage_count,
            "srr_type": r.srr_type,
            "min_speakers": r.min_speakers,
            "max_speakers": r.max_speakers,
            "recommended_event_size": r.recommended_event_size,
            "preview_stations": r.preview_stations,
            "checkin_counters": r.checkin_counters,
            "consultation_desks": r.consultation_desks,
            "printer_stations": r.printer_stations,
            "speakers_per_hour": r.speakers_per_hour,
            "setup_time": float(r.setup_time),
            "teardown_time": float(r.teardown_time),
            "hardware_allocation": r.hardware_allocation or [],
            "staff_allocation": r.staff_allocation or [],
            "is_single_station": r.is_single_station
        })

    # Get network templates
    net_res = await db.execute(select(NetworkTemplate))
    network_templates = []
    for r in net_res.scalars().all():
        network_templates.append({
            "name": r.name,
            "slug": r.slug,
            "description": r.description or "",
            "version": r.version,
            "is_default": r.is_default,
            "is_active": r.status == "ACTIVE",
            "usage_count": r.usage_count,
            "venue_capacity": r.venue_capacity,
            "internet_links": r.internet_links,
            "network_capacity": r.network_capacity,
            "isp_type": r.isp_type,
            "primary_router": r.primary_router,
            "backup_router": r.backup_router,
            "firewall": r.firewall,
            "core_switches": r.core_switches,
            "dist_switches": r.dist_switches,
            "access_switches": r.access_switches,
            "access_points": r.access_points,
            "controllers": r.controllers,
            "reg_vlan": r.reg_vlan,
            "srr_vlan": r.srr_vlan,
            "org_vlan": r.org_vlan,
            "prod_vlan": r.prod_vlan,
            "guest_wifi": r.guest_wifi,
            "exhibitor_network": r.exhibitor_network,
            "streaming_network": r.streaming_network,
            "monitoring_tool": r.monitoring_tool,
            "alerts": r.alerts,
            "logging": r.logging,
            "redundancy": r.redundancy,
            "failover_time": r.failover_time
        })

    return {
        "room_templates": room_templates,
        "registration_templates": registration_templates,
        "srr_templates": srr_templates,
        "network_templates": network_templates
    }

class SuperAdminTemplateInput(BaseModel):
    name: str
    template_type: str
    description_text: Optional[str] = ""
    version: Optional[str] = "v1.0"
    is_default: Optional[bool] = False
    specs: Optional[dict] = None
    status: Optional[str] = "ACTIVE"

@router.post("/superadmin/catalog/templates")
async def superadmin_create_template(
    body: SuperAdminTemplateInput,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    import uuid
    import re
    from app.modules.templates.models import RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate
    from sqlalchemy import update
    
    # Generate slug from name
    slug = re.sub(r'[^a-zA-Z0-9-]', '-', body.name.lower())
    slug = re.sub(r'-+', '-', slug).strip('-')
    if not slug:
        slug = f"template-{uuid.uuid4().hex[:6]}"

    t_type = body.template_type.lower()
    if t_type == "room":
        model_class = RoomTemplate
    elif t_type == "registration":
        model_class = RegistrationTemplate
    elif t_type == "srr":
        model_class = SrrTemplate
    elif t_type == "network":
        model_class = NetworkTemplate
    else:
        raise HTTPException(status_code=400, detail=f"Invalid template type: {body.template_type}")

    # Check if slug exists, if so append random characters
    exists_res = await db.execute(select(model_class).where(model_class.slug == slug))
    if exists_res.scalar_one_or_none():
        slug = f"{slug}-{uuid.uuid4().hex[:4]}"

    # If setting default, unset others of same type
    if body.is_default:
        await db.execute(
            update(model_class)
            .values(is_default=False)
        )

    # Prepare model attributes
    specs = body.specs or {}
    
    # Create the template instance
    tpl_obj = model_class(
        id=uuid.uuid4(),
        organization_id=current_user.organization_id,
        name=body.name,
        slug=slug,
        description=body.description_text,
        status=body.status,
        is_default=body.is_default,
        version=body.version or "v1.0",
        usage_count=0
    )
    
    # Set specs fields
    for k, v in specs.items():
        if hasattr(tpl_obj, k):
            setattr(tpl_obj, k, v)
            
    db.add(tpl_obj)
    await db.commit()
    return {"status": "success", "slug": slug}

@router.put("/superadmin/catalog/templates/{slug}")
async def superadmin_update_template(
    slug: str,
    body: SuperAdminTemplateInput,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import update
    from app.modules.templates.models import RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate
    
    t_type = body.template_type.lower()
    if t_type == "room":
        model_class = RoomTemplate
    elif t_type == "registration":
        model_class = RegistrationTemplate
    elif t_type == "srr":
        model_class = SrrTemplate
    elif t_type == "network":
        model_class = NetworkTemplate
    else:
        raise HTTPException(status_code=400, detail=f"Invalid template type: {body.template_type}")

    # Find existing template
    stmt = select(model_class).where(model_class.slug == slug)
    tpl = (await db.execute(stmt)).scalar_one_or_none()
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    # If setting default, unset others of same type
    if body.is_default:
        await db.execute(
            update(model_class)
            .values(is_default=False)
        )

    # Update template values
    tpl.name = body.name
    tpl.description = body.description_text
    tpl.status = body.status
    tpl.is_default = body.is_default
    tpl.version = body.version or tpl.version

    specs = body.specs or {}
    for k, v in specs.items():
        if hasattr(tpl, k):
            setattr(tpl, k, v)

    await db.commit()
    return {"status": "success"}

@router.post("/superadmin/catalog/templates/{slug}/duplicate")
async def superadmin_duplicate_template(
    slug: str,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    import uuid
    import re
    from app.modules.templates.models import RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate
    
    # Try to find the template in any of the 4 tables
    tpl = None
    model_class = None
    for mc in [RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate]:
        stmt = select(mc).where(mc.slug == slug)
        tpl = (await db.execute(stmt)).scalar_one_or_none()
        if tpl:
            model_class = mc
            break
            
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    new_name = f"{tpl.name} (Copy)"
    new_slug = re.sub(r'[^a-zA-Z0-9-]', '-', new_name.lower())
    new_slug = re.sub(r'-+', '-', new_slug).strip('-')
    
    exists_res = (await db.execute(select(model_class).where(model_class.slug == new_slug))).scalar_one_or_none()
    if exists_res:
        new_slug = f"{new_slug}-{uuid.uuid4().hex[:4]}"

    # Clone properties
    cloned_tpl = model_class(
        id=uuid.uuid4(),
        organization_id=tpl.organization_id,
        name=new_name,
        slug=new_slug,
        description=tpl.description,
        status=tpl.status,
        is_default=False,
        version=tpl.version,
        usage_count=0
    )
    
    # Copy other columns dynamically
    for column in model_class.__table__.columns:
        col_name = column.name
        if col_name not in ["id", "slug", "name", "is_default", "usage_count", "created_at", "updated_at"]:
            setattr(cloned_tpl, col_name, getattr(tpl, col_name))
            
    db.add(cloned_tpl)
    await db.commit()
    return {"status": "success", "slug": new_slug}

@router.post("/superadmin/catalog/templates/{slug}/default")
async def superadmin_set_default_template(
    slug: str,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    from sqlalchemy import update
    from app.modules.templates.models import RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate
    
    # Try to find the template in any of the 4 tables
    tpl = None
    model_class = None
    for mc in [RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate]:
        stmt = select(mc).where(mc.slug == slug)
        tpl = (await db.execute(stmt)).scalar_one_or_none()
        if tpl:
            model_class = mc
            break
            
    if not tpl:
        raise HTTPException(status_code=404, detail="Template not found")

    # Unset default on all templates of this table
    await db.execute(
        update(model_class)
        .values(is_default=False)
    )

    # Set default on this template
    tpl.is_default = True
    await db.commit()
    return {"status": "success"}

@router.delete("/superadmin/catalog/templates/{slug}")
async def superadmin_delete_template(
    slug: str,
    current_user: User = Depends(require_super_admin),
    db: AsyncSession = Depends(get_db)
):
    from app.modules.templates.models import RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate
    
    # Try to delete from any of the 4 tables
    for mc in [RoomTemplate, RegistrationTemplate, SrrTemplate, NetworkTemplate]:
        stmt = select(mc).where(mc.slug == slug)
        tpl = (await db.execute(stmt)).scalar_one_or_none()
        if tpl:
            await db.delete(tpl)
            await db.commit()
            return {"status": "success"}

    raise HTTPException(status_code=404, detail="Template not found")
