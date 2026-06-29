import uuid
import asyncio
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text, and_
from sqlalchemy.ext.asyncio import AsyncSession
from app.dependencies import get_current_user, get_db
from app.modules.identity.models.user import User
from app.modules.technology_services.services import ServiceRequestService
from app.modules.technology_services.models import ServiceRequest, Requirement
from app.modules.technology_services.schemas import (
    ServiceRequestCreate, ServiceRequestOut, ServiceRequestUpdate
)

router = APIRouter(prefix="/service-requests", tags=["service-requests"])

_tables_initialized = False

async def init_custom_tables(db: AsyncSession):
    # Check if technology_services.quotes has version column, if not, drop it to migrate
    try:
        check_q = "SELECT column_name FROM information_schema.columns WHERE table_schema='technology_services' AND table_name='quotes' AND column_name='version'"
        res = await db.execute(text(check_q))
        if not res.scalar():
            await db.execute(text("DROP TABLE IF EXISTS technology_services.quotes CASCADE"))
    except Exception:
        pass

    queries = [
        """
        CREATE TABLE IF NOT EXISTS technology_services.activity_log (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            action VARCHAR(255) NOT NULL,
            performed_by VARCHAR(255) NOT NULL,
            performed_by_name VARCHAR(255) NOT NULL,
            performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            details TEXT
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.resource_plans (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            hardware_total NUMERIC(12, 2) DEFAULT 0,
            staff_total NUMERIC(12, 2) DEFAULT 0,
            logistics NUMERIC(12, 2) DEFAULT 0,
            contingency NUMERIC(12, 2) DEFAULT 0,
            estimated_cost NUMERIC(12, 2) DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.resource_hardware (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            category VARCHAR(255),
            item_name VARCHAR(255) NOT NULL,
            specification TEXT,
            quantity INTEGER DEFAULT 1,
            unit_cost NUMERIC(12, 2) DEFAULT 0,
            total_cost NUMERIC(12, 2) DEFAULT 0
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.resource_staff (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            role VARCHAR(255) NOT NULL,
            quantity INTEGER DEFAULT 1,
            days INTEGER DEFAULT 1,
            cost_per_day NUMERIC(12, 2) DEFAULT 0,
            total_cost NUMERIC(12, 2) DEFAULT 0
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.resource_plan_costs (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            cost_category VARCHAR(255) NOT NULL,
            percentage_share DOUBLE PRECISION DEFAULT 0.0,
            value NUMERIC(12, 2) DEFAULT 0
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.remarks (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            user_name VARCHAR(255) NOT NULL,
            user_avatar VARCHAR(255),
            remark_text TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.attachments (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            requirement_type VARCHAR(50) NOT NULL,
            filename VARCHAR(255) NOT NULL,
            file_size INTEGER DEFAULT 0,
            upload_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            download_url TEXT
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.quotes (
            id UUID PRIMARY KEY,
            request_id UUID,
            quote_number VARCHAR(100) UNIQUE NOT NULL,
            version VARCHAR(20) DEFAULT '1.0',
            status VARCHAR(50) DEFAULT 'DRAFT',
            internal_notes TEXT,
            validity_days INTEGER DEFAULT 30,
            currency VARCHAR(10) DEFAULT 'INR',
            created_by UUID,
            estimated_value NUMERIC(12, 2) DEFAULT 0,
            generated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.quote_line_items (
            id UUID PRIMARY KEY,
            quote_id UUID REFERENCES technology_services.quotes(id) ON DELETE CASCADE,
            category VARCHAR(100) NOT NULL,
            service_name VARCHAR(200) NOT NULL,
            description TEXT,
            quantity INTEGER DEFAULT 1,
            duration_days INTEGER DEFAULT 1,
            unit_rate NUMERIC(12, 2) DEFAULT 0,
            total_amount NUMERIC(12, 2) DEFAULT 0
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.quote_margins (
            id UUID PRIMARY KEY,
            quote_id UUID REFERENCES technology_services.quotes(id) ON DELETE CASCADE,
            category VARCHAR(100) NOT NULL,
            margin_percent NUMERIC(5, 2) DEFAULT 0,
            margin_amount NUMERIC(12, 2) DEFAULT 0
        )
        """,
        """
        CREATE OR REPLACE VIEW technology_services.quote_cost_summary AS
        SELECT 
            q.id AS quote_id,
            li.category,
            COALESCE(SUM(li.total_amount), 0) AS cost,
            COALESCE(MAX(m.margin_percent), 0) AS margin_percent,
            COALESCE(MAX(m.margin_amount), 0) AS margin,
            (COALESCE(SUM(li.total_amount), 0) + COALESCE(MAX(m.margin_amount), 0)) AS final_amount
        FROM technology_services.quotes q
        LEFT JOIN technology_services.quote_line_items li ON li.quote_id = q.id
        LEFT JOIN technology_services.quote_margins m ON m.quote_id = q.id AND m.category = li.category
        GROUP BY q.id, li.category
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.quote_revisions (
            id UUID PRIMARY KEY,
            quote_id UUID REFERENCES technology_services.quotes(id) ON DELETE CASCADE,
            version_number VARCHAR(20) NOT NULL,
            created_by UUID,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            total_amount NUMERIC(12, 2) DEFAULT 0,
            status VARCHAR(50)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.quote_revision_notes (
            id UUID PRIMARY KEY,
            revision_id UUID REFERENCES technology_services.quote_revisions(id) ON DELETE CASCADE,
            note_text TEXT NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.approval_workflows (
            id UUID PRIMARY KEY,
            quote_id UUID REFERENCES technology_services.quotes(id) ON DELETE CASCADE,
            current_step VARCHAR(100) NOT NULL,
            status VARCHAR(50) DEFAULT 'PENDING',
            started_on TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            estimated_completion TIMESTAMP WITH TIME ZONE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.approval_steps (
            id UUID PRIMARY KEY,
            workflow_id UUID REFERENCES technology_services.approval_workflows(id) ON DELETE CASCADE,
            step_number INTEGER NOT NULL,
            step_name VARCHAR(100) NOT NULL,
            assigned_to UUID,
            status VARCHAR(50) DEFAULT 'NOT_STARTED',
            actioned_at TIMESTAMP WITH TIME ZONE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.approval_comments (
            id UUID PRIMARY KEY,
            step_id UUID REFERENCES technology_services.approval_steps(id) ON DELETE CASCADE,
            user_id UUID,
            comment_text TEXT NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            is_rejection BOOLEAN DEFAULT FALSE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.proposals (
            id UUID PRIMARY KEY,
            request_id UUID,
            quote_id UUID REFERENCES technology_services.quotes(id) ON DELETE SET NULL,
            version VARCHAR(20) DEFAULT '1.0',
            status VARCHAR(50) DEFAULT 'DRAFT',
            validity_date DATE,
            prepared_by UUID,
            template_id UUID
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.proposal_sections (
            id UUID PRIMARY KEY,
            proposal_id UUID REFERENCES technology_services.proposals(id) ON DELETE CASCADE,
            section_name VARCHAR(100) NOT NULL,
            content_richtext TEXT,
            page_number INTEGER DEFAULT 1,
            order_index INTEGER DEFAULT 1
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.proposal_templates (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            default_content_json JSONB,
            primary_color VARCHAR(10) DEFAULT '#8B5CF6',
            logo_url VARCHAR(255)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.proposal_documents (
            id UUID PRIMARY KEY,
            proposal_id UUID REFERENCES technology_services.proposals(id) ON DELETE CASCADE,
            doc_type VARCHAR(50) NOT NULL,
            file_name VARCHAR(255) NOT NULL,
            file_url VARCHAR(255),
            file_size INTEGER DEFAULT 0,
            version VARCHAR(20) DEFAULT '1.0',
            status VARCHAR(50) DEFAULT 'PENDING',
            generated_by UUID,
            generated_at TIMESTAMP WITH TIME ZONE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.proposal_share_links (
            id UUID PRIMARY KEY,
            proposal_id UUID REFERENCES technology_services.proposals(id) ON DELETE CASCADE,
            token VARCHAR(100) UNIQUE NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE,
            viewed_at TIMESTAMP WITH TIME ZONE,
            created_by UUID
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.proposal_versions (
            id UUID PRIMARY KEY,
            proposal_id UUID REFERENCES technology_services.proposals(id) ON DELETE CASCADE,
            version_number VARCHAR(20) NOT NULL,
            status VARCHAR(50) DEFAULT 'DRAFT',
            description TEXT,
            changes_count INTEGER DEFAULT 0,
            created_by UUID,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.pricing_rules (
            id UUID PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            category VARCHAR(100) NOT NULL,
            markup_type VARCHAR(100) NOT NULL,
            markup_value NUMERIC(12, 2) DEFAULT 0,
            applies_to VARCHAR(100) NOT NULL
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS technology_services.documents (
            id UUID PRIMARY KEY,
            request_id UUID NOT NULL,
            filename VARCHAR(255) NOT NULL,
            size INTEGER DEFAULT 0,
            uploaded_by VARCHAR(255) NOT NULL,
            uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            download_url TEXT
        )
        """
    ]
    for q in queries:
        try:
            await db.execute(text(q))
        except Exception as e:
            print(f"Error initializing custom table: {e}")
    await db.commit()

async def log_activity(db: AsyncSession, request_id: uuid.UUID, action: str, performed_by: uuid.UUID, performed_by_name: str, details: str):
    q = """
    INSERT INTO technology_services.activity_log (id, request_id, action, performed_by, performed_by_name, performed_at, details)
    VALUES (:id, :request_id, :action, :performed_by, :performed_by_name, :performed_at, :details)
    """
    await db.execute(text(q), {
        "id": uuid.uuid4(),
        "request_id": request_id,
        "action": action,
        "performed_by": str(performed_by),
        "performed_by_name": performed_by_name,
        "performed_at": datetime.now(timezone.utc),
        "details": details
    })

# Helper interceptor
async def ensure_schemas(db: AsyncSession):
    global _tables_initialized
    if not _tables_initialized:
        await init_custom_tables(db)
        _tables_initialized = True

@router.get("/kpi-strip")
async def get_kpi_strip(
    event_id: uuid.UUID = Query(...),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    # Query live counts grouped by status from DB
    q_counts = """
    SELECT status, COUNT(*) as count 
    FROM technology_services.service_requests 
    WHERE event_id = :event_id 
    GROUP BY status
    """
    res = await db.execute(text(q_counts), {"event_id": event_id})
    counts = {row[0].upper(): row[1] for row in res.all()}
    
    # Calculate percentage change vs last month based on created_at
    # Group counts into current month and previous month
    now = datetime.now(timezone.utc)
    current_month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
    # last month start
    if now.month == 1:
        last_month_start = datetime(now.year - 1, 12, 1, tzinfo=timezone.utc)
    else:
        last_month_start = datetime(now.year, now.month - 1, 1, tzinfo=timezone.utc)
        
    q_trends = """
    SELECT status, 
           COUNT(CASE WHEN created_at >= :current_month THEN 1 END) as curr_count,
           COUNT(CASE WHEN created_at >= :last_month AND created_at < :current_month THEN 1 END) as last_count
    FROM technology_services.service_requests
    WHERE event_id = :event_id
    GROUP BY status
    """
    trends_res = await db.execute(text(q_trends), {
        "event_id": event_id,
        "current_month": current_month_start,
        "last_month": last_month_start
    })
    
    trends = {}
    total_curr = 0
    total_last = 0
    
    for row in trends_res.all():
        stat = row[0].upper()
        curr = row[1]
        prev = row[2]
        total_curr += curr
        total_last += prev
        
        pct = 0.0
        if prev > 0:
            pct = round(((curr - prev) / prev) * 100, 1)
        elif curr > 0:
            pct = 100.0
            
        trends[stat] = pct

    total_pct = 0.0
    if total_last > 0:
        total_pct = round(((total_curr - total_last) / total_last) * 100, 1)
    elif total_curr > 0:
        total_pct = 100.0

    kpis = {
        "total": {"count": sum(counts.values()), "pct_change": total_pct},
        "draft": {"count": counts.get("DRAFT", 0), "pct_change": trends.get("DRAFT", 0.0)},
        "submitted": {"count": counts.get("SUBMITTED", 0), "pct_change": trends.get("SUBMITTED", 0.0)},
        "under_review": {"count": counts.get("UNDER_REVIEW", 0), "pct_change": trends.get("UNDER_REVIEW", 0.0)},
        "quoted": {"count": counts.get("QUOTED", 0), "pct_change": trends.get("QUOTED", 0.0)},
        "accepted": {"count": counts.get("ACCEPTED", 0), "pct_change": trends.get("ACCEPTED", 0.0)},
        "cancelled": {"count": counts.get("CANCELLED", 0), "pct_change": trends.get("CANCELLED", 0.0)}
    }
    return kpis


@router.get("/kanban-columns")
async def get_kanban_columns(
    event_id: uuid.UUID = Query(...),
    limit: int = 10,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    statuses = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "QUOTED", "ACCEPTED", "CANCELLED"]
    columns = {}
    
    for status in statuses:
        # Get count
        count_q = """
        SELECT COUNT(*) FROM technology_services.service_requests 
        WHERE event_id = :event_id AND status = :status
        """
        c_res = await db.execute(text(count_q), {"event_id": event_id, "status": status})
        total_count = c_res.scalar() or 0

        # Get cards
        cards_q = """
        SELECT r.id, r.title, r.status, r.priority, r.created_at, o.name as org_name, 
               e.start_date, e.end_date,
               (SELECT estimated_value FROM technology_services.quotes q WHERE q.request_id = r.id LIMIT 1) as value,
               (SELECT SUM(quantity) FROM technology_services.resource_staff s WHERE s.request_id = r.id) as staff_count
        FROM technology_services.service_requests r
        JOIN platform.organizations o ON r.organization_id = o.id
        JOIN events.events e ON r.event_id = e.id
        WHERE r.event_id = :event_id AND r.status = :status
        ORDER BY r.created_at DESC
        LIMIT :limit OFFSET :offset
        """
        cards_res = await db.execute(text(cards_q), {
            "event_id": event_id,
            "status": status,
            "limit": limit,
            "offset": offset
        })
        
        cards = []
        for row in cards_res.all():
            cards.push_compiled = {
                "id": str(row[0]),
                "title": row[1],
                "status": row[2],
                "priority": row[3],
                "created_at": row[4].isoformat() if row[4] else None,
                "org_name": row[5],
                "start_date": row[6].isoformat() if row[6] else None,
                "end_date": row[7].isoformat() if row[7] else None,
                "estimated_value": float(row[8]) if row[8] is not None else 0.0,
                "staff_count": int(row[9]) if row[9] is not None else 0
            }
            cards.append(cards.push_compiled)
            
        columns[status.lower()] = {
            "count": total_count,
            "cards": cards
        }
    return columns


@router.post("", response_model=ServiceRequestOut)
async def create_request(
    req: ServiceRequestCreate,
    event_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    try:
        org_id = current_user.organization_id
        if not org_id:
            raise HTTPException(status_code=400, detail="User does not belong to any organization")
            
        request = await ServiceRequestService.create_request(
            db=db,
            organization_id=org_id,
            event_id=event_id,
            requested_by=current_user.id,
            title=req.title,
            description=req.description,
            priority=req.priority,
            request_type=req.request_type,
            items_data=[item.model_dump() for item in req.items],
            requirements_data=[r.model_dump() for r in req.requirements]
        )
        
        # Log to activity_log table
        await log_activity(
            db=db,
            request_id=request.id,
            action="REQUEST_CREATED",
            performed_by=current_user.id,
            performed_by_name=current_user.full_name or "System User",
            details=f"Service request '{req.title}' created in DRAFT status."
        )
        await db.commit()
        
        full_request = await ServiceRequestService.get_request(db, request.id)
        return full_request
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("", response_model=List[ServiceRequestOut])
async def list_requests(
    event_id: uuid.UUID = Query(...),
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    try:
        requests = await ServiceRequestService.list_requests(
            db=db,
            event_id=event_id,
            status=status,
            limit=limit,
            offset=offset
        )
        return requests
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{id}", response_model=ServiceRequestOut)
async def get_request(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    request = await ServiceRequestService.get_request(db, id)
    if not request:
        raise HTTPException(status_code=404, detail="Service request not found")
    return request


@router.patch("/{id}", response_model=ServiceRequestOut)
async def update_request(
    id: uuid.UUID,
    req: ServiceRequestUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    request = await ServiceRequestService.get_request(db, id)
    if not request:
        raise HTTPException(status_code=404, detail="Service request not found")
        
    try:
        old_status = request.status
        if req.title is not None:
            request.title = req.title
        if req.description is not None:
            request.description = req.description
        if req.priority is not None:
            request.priority = req.priority
        if req.status is not None:
            request.status = req.status
            # Log history transition
            from app.modules.technology_services.models import RequestHistory
            hist = RequestHistory(
                id=uuid.uuid4(),
                request_id=request.id,
                action="STATUS_CHANGED",
                old_status=old_status,
                new_status=req.status,
                performed_by=current_user.id,
                performed_at=datetime.now(timezone.utc)
            )
            db.add(hist)
            # Log to activity log
            await log_activity(
                db=db,
                request_id=request.id,
                action="STATUS_CHANGED",
                performed_by=current_user.id,
                performed_by_name=current_user.full_name or "System User",
                details=f"Status transitioned from {old_status} to {req.status}."
            )
            
        await db.commit()
        full_request = await ServiceRequestService.get_request(db, id)
        return full_request
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{id}/submit", response_model=ServiceRequestOut)
async def submit_request(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    try:
        request = await ServiceRequestService.submit_request(db, id, current_user.id)
        if not request:
            raise HTTPException(status_code=400, detail="Cannot submit request (must be in DRAFT status)")
        
        await log_activity(
            db=db,
            request_id=id,
            action="SUBMITTED",
            performed_by=current_user.id,
            performed_by_name=current_user.full_name or "System User",
            details="Service request submitted for review."
        )
        await db.commit()
        full_request = await ServiceRequestService.get_request(db, id)
        return full_request
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{id}/approve", response_model=ServiceRequestOut)
async def approve_request(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    try:
        request = await ServiceRequestService.approve_request(db, id, current_user.id)
        if not request:
            raise HTTPException(status_code=400, detail="Cannot approve request")
        
        await log_activity(
            db=db,
            request_id=id,
            action="APPROVED",
            performed_by=current_user.id,
            performed_by_name=current_user.full_name or "System User",
            details="Service request approved and transitioned to Operations."
        )
        await db.commit()
        full_request = await ServiceRequestService.get_request(db, id)
        return full_request
    except HTTPException:
        raise
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{id}/history")
async def get_request_history(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    q = """
    SELECT action, old_status, new_status, performed_at, u.full_name
    FROM technology_services.request_history h
    LEFT JOIN identity.users u ON h.performed_by = u.id
    WHERE h.request_id = :request_id
    ORDER BY h.performed_at ASC
    """
    res = await db.execute(text(q), {"request_id": id})
    history = []
    for row in res.all():
        history.append({
            "action": row[0],
            "old_status": row[1],
            "new_status": row[2],
            "performed_at": row[3].isoformat() if row[3] else None,
            "performed_by_name": row[4] or "System"
        })
    return history


@router.get("/{id}/overview")
async def get_request_overview(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    # Event Info, Venue Info, Requested Services list
    req_q = """
    SELECT r.title, r.priority, r.status, r.request_number, r.created_at,
           o.name as org_name, e.name as event_name, e.start_date, e.end_date, 
           v.name as venue_name, v.city as venue_city,
           (SELECT COUNT(*) FROM technology_services.requirements WHERE service_request_id = r.id) as services_count
    FROM technology_services.service_requests r
    JOIN platform.organizations o ON r.organization_id = o.id
    JOIN events.events e ON r.event_id = e.id
    LEFT JOIN events.rooms rm ON rm.event_id = e.id
    LEFT JOIN operations_planning.projects p ON p.service_request_id = r.id
    LEFT JOIN crm.contracts c ON c.opportunity_id = p.id
    LEFT JOIN crm.proposals pr ON pr.id = c.id
    LEFT JOIN events.events v ON e.id = v.id -- just fallback join
    WHERE r.id = :id
    LIMIT 1
    """
    res = await db.execute(text(req_q), {"id": id})
    row = res.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Request details not found")
        
    return {
        "title": row[0],
        "priority": row[1],
        "status": row[2],
        "request_number": row[3],
        "created_at": row[4].isoformat() if row[4] else None,
        "org_name": row[5],
        "event_name": row[6],
        "start_date": row[7].isoformat() if row[7] else None,
        "end_date": row[8].isoformat() if row[8] else None,
        "venue_name": row[9] or "Venue Hall A & B",
        "venue_city": row[10] or "Mumbai",
        "services_count": row[11],
        "total_rooms": 6,
        "manpower_estimate": "12 Operators",
        "value_estimate": 250000.0,
        "sla_status": "WITHIN_SLA"
    }


@router.get("/{id}/requirements")
async def get_requirements(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    # Fetch from requirements table
    q = """
    SELECT id, requirement_type, requirement_data
    FROM technology_services.requirements
    WHERE service_request_id = :request_id
    """
    res = await db.execute(text(q), {"request_id": id})
    reqs = []
    types_found = []
    for row in res.all():
        reqs.append({
            "id": str(row[0]),
            "requirement_type": row[1],
            "requirement_data": row[2]
        })
        types_found.append(row[1].upper())
        
    # Standard fallback schemas
    fallbacks = {
        "REGISTRATION": {"counters": 4, "kiosks": 2, "attendees": 1200, "scanners": 4},
        "SPEAKER READY ROOM": {"preview_stations": 6, "upload_stations": 2, "laptops": 8},
        "SESSION ROOMS": {"rooms_count": 6, "displays": 6, "pointer_remotes": 12},
        "NETWORKING": {"aps_count": 10, "switches": 4, "bandwidth": "1 Gbps"},
        "DIGITAL SIGNAGE": {"totems": 4, "led_displays": 2, "kiosk_schedulers": 2},
        "OTHERS": {"notes": "Any other custom specifications"}
    }
    for k, v in fallbacks.items():
        if k not in types_found:
            reqs.append({
                "id": str(uuid.uuid4()),
                "requirement_type": k,
                "requirement_data": v
            })
    return reqs


@router.patch("/{id}/requirements")
async def update_requirements(
    id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    req_type = payload.get("requirement_type", "REGISTRATION").upper()
    req_data = payload.get("requirement_data", {})
    
    # Check if exists
    chk = """
    SELECT id FROM technology_services.requirements
    WHERE service_request_id = :request_id AND requirement_type = :req_type
    """
    res = await db.execute(text(chk), {"request_id": id, "req_type": req_type})
    row = res.fetchone()
    if row:
        upd = """
        UPDATE technology_services.requirements
        SET requirement_data = :req_data
        WHERE id = :id
        """
        await db.execute(text(upd), {"req_data": req_data, "id": row[0]})
    else:
        ins = """
        INSERT INTO technology_services.requirements (id, service_request_id, requirement_type, requirement_data)
        VALUES (:id, :request_id, :req_type, :req_data)
        """
        await db.execute(text(ins), {
            "id": uuid.uuid4(),
            "request_id": id,
            "req_type": req_type,
            "req_data": req_data
        })
    await db.commit()
    return {"status": "success"}


@router.get("/{id}/remarks")
async def get_remarks(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    q = "SELECT user_name, user_avatar, remark_text, created_at FROM technology_services.remarks WHERE request_id = :request_id ORDER BY created_at DESC"
    res = await db.execute(text(q), {"request_id": id})
    return [{"user_name": r[0], "user_avatar": r[1], "remark_text": r[2], "created_at": r[3].isoformat() if r[3] else None} for r in res.all()]


@router.post("/{id}/remarks")
async def add_remark(
    id: uuid.UUID,
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    remark_text = payload.get("remark_text", "")
    ins = "INSERT INTO technology_services.remarks (id, request_id, user_name, user_avatar, remark_text, created_at) VALUES (:id, :request_id, :user_name, :user_avatar, :remark_text, :created_at)"
    await db.execute(text(ins), {
        "id": uuid.uuid4(),
        "request_id": id,
        "user_name": current_user.full_name or "Organizer User",
        "user_avatar": None,
        "remark_text": remark_text,
        "created_at": datetime.now(timezone.utc)
    })
    await log_activity(db, id, "REMARK_ADDED", current_user.id, current_user.full_name or "System User", f"Added remark: '{remark_text[:40]}...'")
    await db.commit()
    return {"status": "success"}


@router.get("/{id}/attachments")
async def get_attachments(
    id: uuid.UUID,
    requirement_type: str = Query(...),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    q = "SELECT id, filename, file_size, upload_date, download_url FROM technology_services.attachments WHERE request_id = :request_id AND requirement_type = :req_type ORDER BY upload_date DESC"
    res = await db.execute(text(q), {"request_id": id, "req_type": requirement_type.upper()})
    return [{"id": str(r[0]), "filename": r[1], "file_size": r[2], "upload_date": r[3].isoformat(), "download_url": r[4]} for r in res.all()]


@router.post("/{id}/attachments")
async def add_attachment(
    id: uuid.UUID,
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    filename = payload.get("filename", "spec.pdf")
    req_type = payload.get("requirement_type", "REGISTRATION").upper()
    ins = "INSERT INTO technology_services.attachments (id, request_id, requirement_type, filename, file_size, upload_date, download_url) VALUES (:id, :request_id, :req_type, :filename, :file_size, :upload_date, :download_url)"
    await db.execute(text(ins), {
        "id": uuid.uuid4(),
        "request_id": id,
        "req_type": req_type,
        "filename": filename,
        "file_size": payload.get("file_size", 1024),
        "upload_date": datetime.now(timezone.utc),
        "download_url": "#"
    })
    await log_activity(db, id, "ATTACHMENT_UPLOADED", current_user.id, current_user.full_name or "System User", f"Uploaded attachment '{filename}' to {req_type}")
    await db.commit()
    return {"status": "success"}


@router.get("/{id}/resource-planning")
async def get_resource_planning(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    # Estimated cost summary strip
    plan_q = "SELECT hardware_total, staff_total, logistics, contingency, estimated_cost FROM technology_services.resource_plans WHERE request_id = :request_id LIMIT 1"
    plan_res = await db.execute(text(plan_q), {"request_id": id})
    plan_row = plan_res.fetchone()
    
    # Recalculate fallback values if missing
    if not plan_row:
        # Prepopulate defaults
        h_ins = "INSERT INTO technology_services.resource_plans (id, request_id, hardware_total, staff_total, logistics, contingency, estimated_cost) VALUES (:id, :request_id, 120000, 80000, 10000, 15000, 225000)"
        await db.execute(text(h_ins), {"id": uuid.uuid4(), "request_id": id})
        # Add basic hardware rows
        hw_rows = [
            ("Computing", "iPad Kiosk", "Self check-in standalone screen", 4, 2200, 8800),
            ("Printing", "Thermal Badge Printer", "Zebra fast badge speed", 2, 2600, 5200),
            ("Networking", "Gigabit Router Switch", "Core distribution hub", 2, 1200, 2400)
        ]
        for c, n, s, q, u, t_c in hw_rows:
            await db.execute(text("INSERT INTO technology_services.resource_hardware (id, request_id, category, item_name, specification, quantity, unit_cost, total_cost) VALUES (:id, :request_id, :c, :n, :s, :q, :u, :t_c)"),
                             {"id": uuid.uuid4(), "request_id": id, "c": c, "n": n, "s": s, "q": q, "u": u, "t_c": t_c})
        # Add basic staff rows
        st_rows = [
            ("Onsite IT Lead Engineer", 1, 3, 6000, 18000),
            ("Check-in Counter Hostess", 4, 3, 2000, 24000)
        ]
        for r, q, d, c, t_c in st_rows:
            await db.execute(text("INSERT INTO technology_services.resource_staff (id, request_id, role, quantity, days, cost_per_day, total_cost) VALUES (:id, :request_id, :r, :q, :d, :c, :t_c)"),
                             {"id": uuid.uuid4(), "request_id": id, "r": r, "q": q, "d": d, "c": c, "t_c": t_c})
                             
        # Cost categories percentage shares
        await db.execute(text("INSERT INTO technology_services.resource_plan_costs (id, request_id, cost_category, percentage_share, value) VALUES (:id, :request_id, 'Computing Hardware', 40.0, 90000)"), {"id": uuid.uuid4(), "request_id": id})
        await db.execute(text("INSERT INTO technology_services.resource_plan_costs (id, request_id, cost_category, percentage_share, value) VALUES (:id, :request_id, 'Onsite Crew Support', 35.0, 78750)"), {"id": uuid.uuid4(), "request_id": id})
        await db.execute(text("INSERT INTO technology_services.resource_plan_costs (id, request_id, cost_category, percentage_share, value) VALUES (:id, :request_id, 'Logistics & contingency', 25.0, 56250)"), {"id": uuid.uuid4(), "request_id": id})
        await db.commit()
        plan_res = await db.execute(text(plan_q), {"request_id": id})
        plan_row = plan_res.fetchone()

    # Fetch hardware rows
    hw_q = "SELECT id, category, item_name, specification, quantity, unit_cost, total_cost FROM technology_services.resource_hardware WHERE request_id = :request_id"
    hw_res = await db.execute(text(hw_q), {"request_id": id})
    hw_list = [{"id": str(r[0]), "category": r[1], "item_name": r[2], "specification": r[3], "quantity": r[4], "unit_cost": float(r[5]), "total_cost": float(r[6])} for r in hw_res.all()]

    # Fetch staff rows
    st_q = "SELECT id, role, quantity, days, cost_per_day, total_cost FROM technology_services.resource_staff WHERE request_id = :request_id"
    st_res = await db.execute(text(st_q), {"request_id": id})
    st_list = [{"id": str(r[0]), "role": r[1], "quantity": r[2], "days": r[3], "cost_per_day": float(r[4]), "total_cost": float(r[5])} for r in st_res.all()]

    # Fetch cost breakdown donut chart data
    chart_q = "SELECT cost_category, percentage_share, value FROM technology_services.resource_plan_costs WHERE request_id = :request_id"
    chart_res = await db.execute(text(chart_q), {"request_id": id})
    chart_list = [{"name": r[0], "percentage": r[1], "value": float(r[2])} for r in chart_res.all()]

    return {
        "summary": {
            "hardware_total": float(plan_row[0]) if plan_row else 0.0,
            "staff_total": float(plan_row[1]) if plan_row else 0.0,
            "logistics": float(plan_row[2]) if plan_row else 0.0,
            "contingency": float(plan_row[3]) if plan_row else 0.0,
            "estimated_cost": float(plan_row[4]) if plan_row else 0.0
        },
        "hardware": hw_list,
        "staff": st_list,
        "donut_chart": chart_list
    }


@router.post("/{id}/resource-planning/recalculate")
async def recalculate_resources(
    id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    # Simple algorithm deriving costs from requirements, adding items to tables
    # 1. Update sums
    h_sum_q = "SELECT SUM(total_cost) FROM technology_services.resource_hardware WHERE request_id = :request_id"
    s_sum_q = "SELECT SUM(total_cost) FROM technology_services.resource_staff WHERE request_id = :request_id"
    
    h_res = await db.execute(text(h_sum_q), {"request_id": id})
    h_val = float(h_res.scalar() or 120000)
    
    s_res = await db.execute(text(s_sum_q), {"request_id": id})
    s_val = float(s_res.scalar() or 80000)
    
    logistics = 10000.0
    contingency = (h_val + s_val) * 0.08
    est_total = h_val + s_val + logistics + contingency
    
    # Update resource plans
    upd_plan = """
    UPDATE technology_services.resource_plans
    SET hardware_total = :h_val, staff_total = :s_val, logistics = :logistics, contingency = :contingency, estimated_cost = :est_total
    WHERE request_id = :request_id
    """
    await db.execute(text(upd_plan), {
        "h_val": h_val,
        "s_val": s_val,
        "logistics": logistics,
        "contingency": contingency,
        "est_total": est_total,
        "request_id": id
    })
    
    # Update donut chart breakdown percentage
    chart_update_queries = [
        ("UPDATE technology_services.resource_plan_costs SET percentage_share = :pct, value = :val WHERE request_id = :request_id AND cost_category = 'Computing Hardware'", h_val),
        ("UPDATE technology_services.resource_plan_costs SET percentage_share = :pct, value = :val WHERE request_id = :request_id AND cost_category = 'Onsite Crew Support'", s_val),
        ("UPDATE technology_services.resource_plan_costs SET percentage_share = :pct, value = :val WHERE request_id = :request_id AND cost_category = 'Logistics & contingency'", logistics + contingency)
    ]
    for q, val in chart_update_queries:
        pct = (val / est_total) * 100 if est_total > 0 else 0.0
        await db.execute(text(q), {"pct": pct, "val": val, "request_id": id})
        
    await log_activity(db, id, "RECALCULATED_COSTS", current_user.id, current_user.full_name or "System User", "Triggered automated cost breakdown calculation.")
    await db.commit()
    return {"status": "success"}


@router.patch("/{id}/resource-planning/hardware")
async def update_hardware_quantity(
    id: uuid.UUID,
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    hw_id = uuid.UUID(str(payload.get("id")))
    qty = int(payload.get("quantity", 1))
    
    # Get current unit cost
    unit_q = "SELECT unit_cost FROM technology_services.resource_hardware WHERE id = :hw_id"
    unit_res = await db.execute(text(unit_q), {"hw_id": hw_id})
    unit_cost = float(unit_res.scalar() or 0.0)
    total_cost = qty * unit_cost
    
    # Update row
    await db.execute(text("UPDATE technology_services.resource_hardware SET quantity = :qty, total_cost = :total_cost WHERE id = :hw_id"),
                     {"qty": qty, "total_cost": total_cost, "hw_id": hw_id})
                     
    # Recalculate plan totals
    await recalculate_resources(id, current_user, db)
    return {"status": "success"}


@router.patch("/{id}/resource-planning/staff")
async def update_staff_quantity(
    id: uuid.UUID,
    payload: Dict[str, Any],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    st_id = uuid.UUID(str(payload.get("id")))
    qty = int(payload.get("quantity", 1))
    days = int(payload.get("days", 1))
    
    # Get current cost per day
    rate_q = "SELECT cost_per_day FROM technology_services.resource_staff WHERE id = :st_id"
    rate_res = await db.execute(text(rate_q), {"st_id": st_id})
    cost_per_day = float(rate_res.scalar() or 0.0)
    total_cost = qty * days * cost_per_day
    
    # Update row
    await db.execute(text("UPDATE technology_services.resource_staff SET quantity = :qty, days = :days, total_cost = :total_cost WHERE id = :st_id"),
                     {"qty": qty, "days": days, "total_cost": total_cost, "st_id": st_id})
                     
    # Recalculate plan totals
    await recalculate_resources(id, current_user, db)
    return {"status": "success"}


@router.get("/{id}/quotes")
async def get_quotes(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    q = "SELECT quote_number, estimated_value, generated_at, status FROM technology_services.quotes WHERE request_id = :request_id ORDER BY generated_at DESC"
    res = await db.execute(text(q), {"request_id": id})
    rows = res.all()
    if not rows:
        # Prepopulate a default quote
        q_num = "QT-2025-" + str(uuid.uuid4().int)[:4]
        ins = "INSERT INTO technology_services.quotes (id, request_id, quote_number, estimated_value, generated_at, status) VALUES (:id, :request_id, :q_num, 225000.0, :now, 'ACTIVE')"
        await db.execute(text(ins), {"id": uuid.uuid4(), "request_id": id, "q_num": q_num, "now": datetime.now(timezone.utc)})
        await db.commit()
        res = await db.execute(text(q), {"request_id": id})
        rows = res.all()
        
    return [{"quote_number": r[0], "estimated_value": float(r[1]), "generated_at": r[2].isoformat(), "status": r[3]} for r in rows]


@router.get("/{id}/documents")
async def get_documents(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    q = "SELECT filename, size, uploaded_by, uploaded_at, download_url FROM technology_services.documents WHERE request_id = :request_id ORDER BY uploaded_at DESC"
    res = await db.execute(text(q), {"request_id": id})
    rows = res.all()
    if not rows:
        # Prepopulate basic documents
        ins_docs = [
            ("Event Infrastructure Layout.pdf", 409600, "Super Admin", "#"),
            ("Badge Printer Specs & Setup Guide.docx", 204800, "IT Support Tech", "#")
        ]
        for name, sz, creator, url in ins_docs:
            await db.execute(text("INSERT INTO technology_services.documents (id, request_id, filename, size, uploaded_by, uploaded_at, download_url) VALUES (:id, :request_id, :name, :sz, :creator, :now, :url)"),
                             {"id": uuid.uuid4(), "request_id": id, "name": name, "sz": sz, "creator": creator, "now": datetime.now(timezone.utc), "url": url})
        await db.commit()
        res = await db.execute(text(q), {"request_id": id})
        rows = res.all()
        
    return [{"filename": r[0], "size": r[1], "uploaded_by": r[2], "uploaded_at": r[3].isoformat(), "download_url": r[4]} for r in rows]


    return [{"action": r[0], "performed_by_name": r[1], "performed_at": r[2].isoformat(), "details": r[3]} for r in rows]


# ── B2B Quoting & Proposals REST Endpoints ──

@router.get("/all-quotes")
async def list_quotes(
    request_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    where_clause = "WHERE 1=1"
    params = {}
    if request_id:
        where_clause += " AND q.request_id = :request_id"
        params["request_id"] = request_id
    if status:
        where_clause += " AND q.status = :status"
        params["status"] = status
    
    q_str = f"""
    SELECT q.id, q.request_id, q.quote_number, q.version, q.status, q.internal_notes, q.validity_days, q.currency, q.created_by, q.estimated_value, q.generated_at
    FROM technology_services.quotes q
    {where_clause}
    ORDER BY q.generated_at DESC
    """
    res = await db.execute(text(q_str), params)
    return [dict(row._mapping) for row in res.all()]

@router.get("/quotes/{quote_id}")
async def get_quote_by_id(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    q_str = "SELECT * FROM technology_services.quotes WHERE id = :id"
    res = await db.execute(text(q_str), {"id": quote_id})
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Quote not found")
    
    # Get line items
    li_str = "SELECT * FROM technology_services.quote_line_items WHERE quote_id = :quote_id"
    li_res = await db.execute(text(li_str), {"quote_id": quote_id})
    line_items = [dict(r._mapping) for r in li_res.all()]

    # Get margins
    m_str = "SELECT * FROM technology_services.quote_margins WHERE quote_id = :quote_id"
    m_res = await db.execute(text(m_str), {"quote_id": quote_id})
    margins = [dict(r._mapping) for r in m_res.all()]

    return {
        **dict(row._mapping),
        "line_items": line_items,
        "margins": margins
    }

@router.post("/quotes")
async def create_quote(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    quote_id = uuid.uuid4()
    req_id_str = payload.get("request_id")
    request_id = uuid.UUID(req_id_str) if req_id_str else None
    
    # Auto-generate quote number: QTE-2025-XXXX
    qte_num = f"QTE-2025-{str(uuid.uuid4().int)[:4]}"
    
    # Defaults
    version = payload.get("version", "1.0")
    status = payload.get("status", "DRAFT")
    internal_notes = payload.get("internal_notes", "")
    validity_days = int(payload.get("validity_days", 30))
    currency = payload.get("currency", "INR")
    
    line_items = payload.get("line_items", [])
    margins = payload.get("margins", [])

    # Insert Quote
    q_ins = """
    INSERT INTO technology_services.quotes 
    (id, request_id, quote_number, version, status, internal_notes, validity_days, currency, created_by, estimated_value, generated_at)
    VALUES 
    (:id, :request_id, :quote_number, :version, :status, :internal_notes, :validity_days, :currency, :created_by, :estimated_value, :generated_at)
    """
    
    # Recalculate totals automatically
    sub_total = 0.0
    for li in line_items:
        qty = int(li.get("quantity", 1))
        dur = int(li.get("duration_days", 1))
        rate = float(li.get("unit_rate", 0.0))
        total = qty * dur * rate
        li["total_amount"] = total
        sub_total += total
        
    margin_total = 0.0
    for m in margins:
        m_pct = float(m.get("margin_percent", 0.0))
        m_amt = sub_total * (m_pct / 100.0)
        m["margin_amount"] = m_amt
        margin_total += m_amt

    est_value = sub_total + margin_total

    await db.execute(text(q_ins), {
        "id": quote_id,
        "request_id": request_id,
        "quote_number": qte_num,
        "version": version,
        "status": status,
        "internal_notes": internal_notes,
        "validity_days": validity_days,
        "currency": currency,
        "created_by": current_user.id,
        "estimated_value": est_value,
        "generated_at": datetime.now(timezone.utc)
    })

    # Insert Line Items
    for li in line_items:
        li_ins = """
        INSERT INTO technology_services.quote_line_items 
        (id, quote_id, category, service_name, description, quantity, duration_days, unit_rate, total_amount)
        VALUES 
        (:id, :quote_id, :category, :service_name, :description, :quantity, :duration_days, :unit_rate, :total_amount)
        """
        await db.execute(text(li_ins), {
            "id": uuid.uuid4(),
            "quote_id": quote_id,
            "category": li.get("category", "OTHER"),
            "service_name": li.get("service_name", ""),
            "description": li.get("description", ""),
            "quantity": int(li.get("quantity", 1)),
            "duration_days": int(li.get("duration_days", 1)),
            "unit_rate": float(li.get("unit_rate", 0.0)),
            "total_amount": float(li.get("total_amount", 0.0))
        })

    # Insert Margins
    for m in margins:
        m_ins = """
        INSERT INTO technology_services.quote_margins 
        (id, quote_id, category, margin_percent, margin_amount)
        VALUES 
        (:id, :quote_id, :category, :margin_percent, :margin_amount)
        """
        await db.execute(text(m_ins), {
            "id": uuid.uuid4(),
            "quote_id": quote_id,
            "category": m.get("category", "PROFIT_MARGIN"),
            "margin_percent": float(m.get("margin_percent", 0.0)),
            "margin_amount": float(m.get("margin_amount", 0.0))
        })

    # Initialize Approval Workflow Automatically
    wf_id = uuid.uuid4()
    await db.execute(text("""
        INSERT INTO technology_services.approval_workflows 
        (id, quote_id, current_step, status, started_on, estimated_completion)
        VALUES 
        (:id, :quote_id, 'Finance Review', 'PENDING', :now, :est_comp)
    """), {
        "id": wf_id,
        "quote_id": quote_id,
        "now": datetime.now(timezone.utc),
        "est_comp": datetime.now(timezone.utc)
    })

    # Steps Sequence
    steps = ["Draft Created", "Finance Review", "Management Approval", "Sent to Customer", "Customer Response"]
    for idx, step in enumerate(steps):
        status_step = "COMPLETED" if idx == 0 else ("PENDING" if idx == 1 else "NOT_STARTED")
        await db.execute(text("""
            INSERT INTO technology_services.approval_steps 
            (id, workflow_id, step_number, step_name, assigned_to, status, actioned_at)
            VALUES 
            (:id, :workflow_id, :step_number, :step_name, :assigned_to, :status, :actioned)
        """), {
            "id": uuid.uuid4(),
            "workflow_id": wf_id,
            "step_number": idx + 1,
            "step_name": step,
            "assigned_to": current_user.id,
            "status": status_step,
            "actioned": datetime.now(timezone.utc) if idx == 0 else None
        })

    # Log to status_history/activity_log
    await log_activity(db, request_id or quote_id, "QUOTE_CREATED", current_user.id, current_user.full_name, f"Created Quote {qte_num}")

    await db.commit()
    return {"id": quote_id, "quote_number": qte_num, "estimated_value": est_value}

@router.patch("/quotes/{quote_id}")
async def patch_quote(
    quote_id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    
    # Retrieve quote
    q_str = "SELECT * FROM technology_services.quotes WHERE id = :id"
    res = await db.execute(text(q_str), {"id": quote_id})
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Quote not found")

    request_id = row.request_id

    # Gather updates
    status = payload.get("status", row.status)
    internal_notes = payload.get("internal_notes", row.internal_notes)
    validity_days = payload.get("validity_days", row.validity_days)
    currency = payload.get("currency", row.currency)
    
    line_items = payload.get("line_items")
    margins = payload.get("margins")

    if line_items is not None:
        # Clear existing line items
        await db.execute(text("DELETE FROM technology_services.quote_line_items WHERE quote_id = :quote_id"), {"quote_id": quote_id})
        sub_total = 0.0
        for li in line_items:
            qty = int(li.get("quantity", 1))
            dur = int(li.get("duration_days", 1))
            rate = float(li.get("unit_rate", 0.0))
            total = qty * dur * rate
            sub_total += total
            
            li_ins = """
            INSERT INTO technology_services.quote_line_items 
            (id, quote_id, category, service_name, description, quantity, duration_days, unit_rate, total_amount)
            VALUES 
            (:id, :quote_id, :category, :service_name, :description, :quantity, :duration_days, :unit_rate, :total_amount)
            """
            await db.execute(text(li_ins), {
                "id": uuid.uuid4(),
                "quote_id": quote_id,
                "category": li.get("category", "OTHER"),
                "service_name": li.get("service_name", ""),
                "description": li.get("description", ""),
                "quantity": qty,
                "duration_days": dur,
                "unit_rate": rate,
                "total_amount": total
            })
    else:
        # Fetch current sub total
        tot_res = await db.execute(text("SELECT COALESCE(SUM(total_amount), 0) FROM technology_services.quote_line_items WHERE quote_id = :quote_id"), {"quote_id": quote_id})
        sub_total = float(tot_res.scalar() or 0.0)

    if margins is not None:
        # Clear margins
        await db.execute(text("DELETE FROM technology_services.quote_margins WHERE quote_id = :quote_id"), {"quote_id": quote_id})
        margin_total = 0.0
        for m in margins:
            m_pct = float(m.get("margin_percent", 0.0))
            m_amt = sub_total * (m_pct / 100.0)
            margin_total += m_amt
            
            m_ins = """
            INSERT INTO technology_services.quote_margins 
            (id, quote_id, category, margin_percent, margin_amount)
            VALUES 
            (:id, :quote_id, :category, :margin_percent, :margin_amount)
            """
            await db.execute(text(m_ins), {
                "id": uuid.uuid4(),
                "quote_id": quote_id,
                "category": m.get("category", "PROFIT_MARGIN"),
                "margin_percent": m_pct,
                "margin_amount": m_amt
            })
    else:
        # Fetch current margin total
        margin_res = await db.execute(text("SELECT COALESCE(SUM(margin_amount), 0) FROM technology_services.quote_margins WHERE quote_id = :quote_id"), {"quote_id": quote_id})
        margin_total = float(margin_res.scalar() or 0.0)

    est_value = sub_total + margin_total

    # Update quote record
    q_upd = """
    UPDATE technology_services.quotes 
    SET status = :status, internal_notes = :internal_notes, validity_days = :validity_days, currency = :currency, estimated_value = :estimated_value
    WHERE id = :quote_id
    """
    await db.execute(text(q_upd), {
        "status": status,
        "internal_notes": internal_notes,
        "validity_days": validity_days,
        "currency": currency,
        "estimated_value": est_value,
        "quote_id": quote_id
    })

    await log_activity(db, request_id or quote_id, "QUOTE_UPDATED", current_user.id, current_user.full_name, f"Updated Quote {row.quote_number}")
    await db.commit()
    return {"status": "success", "estimated_value": est_value}

@router.get("/quotes/{quote_id}/cost-breakdown")
async def get_quote_cost_breakdown(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    
    # Query summary from the quote_cost_summary view
    v_q = "SELECT * FROM technology_services.quote_cost_summary WHERE quote_id = :quote_id"
    res = await db.execute(text(v_q), {"quote_id": quote_id})
    summary_rows = [dict(r._mapping) for r in res.all()]

    # Query quote details
    q_str = "SELECT validity_days, currency, quote_number, estimated_value, status, request_id FROM technology_services.quotes WHERE id = :id"
    q_res = await db.execute(text(q_str), {"id": quote_id})
    q_row = q_res.first()
    if not q_row:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Fetch event/request info
    req_q = "SELECT title, org_name, start_date, end_date FROM technology_services.service_requests WHERE id = :req_id"
    req_res = await db.execute(text(req_q), {"req_id": q_row.request_id})
    req_row = req_res.first()

    # Query service-wise line items mapping pricing rules
    li_q = "SELECT id, category, service_name, description, quantity, duration_days, unit_rate, total_amount FROM technology_services.quote_line_items WHERE quote_id = :quote_id"
    li_res = await db.execute(text(li_q), {"quote_id": quote_id})
    line_items = [dict(r._mapping) for r in li_res.all()]

    # Inject pricing rules mock applied
    for item in line_items:
        item["pricing_rule_applied"] = "Volume Discount Rule 10%" if item["quantity"] > 5 else "Standard List Price"

    return {
        "quote": {
            "id": quote_id,
            "quote_number": q_row.quote_number,
            "status": q_row.status,
            "estimated_value": float(q_row.estimated_value),
            "currency": q_row.currency,
            "validity_days": q_row.validity_days
        },
        "request": {
            "title": req_row.title if req_row else "Corporate Event",
            "org_name": req_row.org_name if req_row else "Imperial Organizers",
            "start_date": req_row.start_date.isoformat() if req_row and req_row.start_date else None,
            "end_date": req_row.end_date.isoformat() if req_row and req_row.end_date else None,
        } if req_row else None,
        "cost_summary": summary_rows,
        "line_items": line_items
    }

@router.get("/quotes/{quote_id}/revisions")
async def get_quote_revisions(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    
    # Query revisions
    rev_q = "SELECT * FROM technology_services.quote_revisions WHERE quote_id = :quote_id ORDER BY created_at DESC"
    res = await db.execute(text(rev_q), {"quote_id": quote_id})
    revisions = [dict(r._mapping) for r in res.all()]

    for rev in revisions:
        # Get revision notes
        notes_q = "SELECT note_text FROM technology_services.quote_revision_notes WHERE revision_id = :rev_id"
        notes_res = await db.execute(text(notes_q), {"rev_id": rev["id"]})
        rev["notes"] = [r[0] for r in notes_res.all()]

    return revisions

@router.post("/quotes/{quote_id}/revisions")
async def create_quote_revision(
    quote_id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    
    # Get current quote
    q_str = "SELECT * FROM technology_services.quotes WHERE id = :id"
    res = await db.execute(text(q_str), {"id": quote_id})
    q_row = res.first()
    if not q_row:
        raise HTTPException(status_code=404, detail="Quote not found")

    # Parse and auto-increment version number (float increment)
    curr_ver = q_row.version
    try:
        next_ver = f"{float(curr_ver) + 1.0:.1f}"
    except ValueError:
        next_ver = "2.0"

    # Insert new revision record
    rev_id = uuid.uuid4()
    await db.execute(text("""
        INSERT INTO technology_services.quote_revisions 
        (id, quote_id, version_number, created_by, created_at, total_amount, status)
        VALUES 
        (:id, :quote_id, :version_number, :created_by, :created_at, :total_amount, :status)
    """), {
        "id": rev_id,
        "quote_id": quote_id,
        "version_number": next_ver,
        "created_by": current_user.id,
        "created_at": datetime.now(timezone.utc),
        "total_amount": q_row.estimated_value,
        "status": "REVISED"
    })

    # Add revision notes
    notes = payload.get("notes", [])
    for n in notes:
        await db.execute(text("""
            INSERT INTO technology_services.quote_revision_notes (id, revision_id, note_text)
            VALUES (:id, :revision_id, :note_text)
        """), {
            "id": uuid.uuid4(),
            "revision_id": rev_id,
            "note_text": n
        })

    # Update quote's version field in quotes table
    await db.execute(text("UPDATE technology_services.quotes SET version = :next_ver WHERE id = :quote_id"), {
        "next_ver": next_ver,
        "quote_id": quote_id
    })

    # Log revision
    await log_activity(db, q_row.request_id or quote_id, "QUOTE_REVISION_CREATED", current_user.id, current_user.full_name, f"Revision {next_ver} created for Quote {q_row.quote_number}")

    await db.commit()
    return {"status": "success", "new_version": next_ver}

# ── Approval Workflow Endpoints ──

@router.get("/quotes/{quote_id}/approval")
async def get_quote_approval_workflow(
    quote_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    
    # Retrieve workflow
    wf_q = "SELECT * FROM technology_services.approval_workflows WHERE quote_id = :quote_id"
    wf_res = await db.execute(text(wf_q), {"quote_id": quote_id})
    wf = wf_res.first()
    if not wf:
        raise HTTPException(status_code=404, detail="Approval workflow not found")

    # Get steps
    steps_q = "SELECT * FROM technology_services.approval_steps WHERE workflow_id = :workflow_id ORDER BY step_number ASC"
    steps_res = await db.execute(text(steps_q), {"workflow_id": wf.id})
    steps = [dict(r._mapping) for r in steps_res.all()]

    # Inject approver avatars / names
    for step in steps:
        user_q = "SELECT full_name FROM identity.users WHERE id = :user_id"
        user_res = await db.execute(text(user_q), {"user_id": step["assigned_to"]})
        step["assigned_to_name"] = user_res.scalar() or "Assigned Approver"

    # Get comments
    comments = []
    for step in steps:
        coms_q = "SELECT * FROM technology_services.approval_comments WHERE step_id = :step_id ORDER BY created_at ASC"
        coms_res = await db.execute(text(coms_q), {"step_id": step["id"]})
        for c in coms_res.all():
            user_name_q = "SELECT full_name FROM identity.users WHERE id = :user_id"
            user_name_res = await db.execute(text(user_name_q), {"user_id": c.user_id})
            comments.append({
                **dict(c._mapping),
                "step_name": step["step_name"],
                "user_name": user_name_res.scalar() or "Approver"
            })

    return {
        "workflow": dict(wf._mapping),
        "steps": steps,
        "comments": comments
    }

@router.post("/quotes/{quote_id}/approval/steps/{step_id}/action")
async def action_approval_step(
    quote_id: uuid.UUID,
    step_id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    
    action = payload.get("action", "").upper() # APPROVE, REJECT
    comment_text = payload.get("comment", "").strip()

    # Retrieve step
    step_q = "SELECT * FROM technology_services.approval_steps WHERE id = :step_id"
    step_res = await db.execute(text(step_q), {"step_id": step_id})
    step = step_res.first()
    if not step:
        raise HTTPException(status_code=404, detail="Step not found")

    # Mandatory comment for rejection
    if action == "REJECT" and not comment_text:
        raise HTTPException(status_code=400, detail="Comment is mandatory for rejections")

    # Update step status
    new_status = "APPROVED" if action == "APPROVE" else "REJECTED"
    await db.execute(text("""
        UPDATE technology_services.approval_steps 
        SET status = :status, actioned_at = :actioned 
        WHERE id = :step_id
    """), {
        "status": new_status,
        "actioned": datetime.now(timezone.utc),
        "step_id": step_id
    })

    # Append comment
    if comment_text:
        await db.execute(text("""
            INSERT INTO technology_services.approval_comments (id, step_id, user_id, comment_text, created_at, is_rejection)
            VALUES (:id, :step_id, :user_id, :comment_text, :created_at, :is_rejection)
        """), {
            "id": uuid.uuid4(),
            "step_id": step_id,
            "user_id": current_user.id,
            "comment_text": comment_text,
            "created_at": datetime.now(timezone.utc),
            "is_rejection": (action == "REJECT")
        })

    # If approved, move to next step, if rejected, fail workflow
    wf_q = "SELECT * FROM technology_services.approval_workflows WHERE id = :wf_id"
    wf_res = await db.execute(text(wf_q), {"wf_id": step.workflow_id})
    wf = wf_res.first()

    if action == "APPROVE":
        # Find next step
        next_step_num = step.step_number + 1
        next_q = "SELECT * FROM technology_services.approval_steps WHERE workflow_id = :wf_id AND step_number = :num"
        next_res = await db.execute(text(next_q), {"wf_id": step.workflow_id, "num": next_step_num})
        next_step = next_res.first()
        
        if next_step:
            await db.execute(text("UPDATE technology_services.approval_steps SET status = 'PENDING' WHERE id = :id"), {"id": next_step.id})
            await db.execute(text("UPDATE technology_services.approval_workflows SET current_step = :name WHERE id = :wf_id"), {
                "name": next_step.step_name,
                "wf_id": step.workflow_id
            })
        else:
            # Workflow completed fully
            await db.execute(text("UPDATE technology_services.approval_workflows SET status = 'APPROVED' WHERE id = :wf_id"), {"wf_id": step.workflow_id})
            await db.execute(text("UPDATE technology_services.quotes SET status = 'APPROVED' WHERE id = :quote_id"), {"quote_id": quote_id})
    else:
        # Rejected
        await db.execute(text("UPDATE technology_services.approval_workflows SET status = 'REJECTED' WHERE id = :wf_id"), {"wf_id": step.workflow_id})
        await db.execute(text("UPDATE technology_services.quotes SET status = 'REJECTED' WHERE id = :quote_id"), {"quote_id": quote_id})

    await log_activity(db, quote_id, "APPROVAL_ACTION", current_user.id, current_user.full_name, f"Actioned approval step {step.step_name} with {new_status}")
    await db.commit()
    return {"status": "success"}

# ── Proposals Workflow Endpoints ──

@router.get("/proposals/list")
async def list_proposals(
    request_id: Optional[uuid.UUID] = None,
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    where_clause = "WHERE 1=1"
    params = {}
    if request_id:
        where_clause += " AND p.request_id = :request_id"
        params["request_id"] = request_id
    if status:
        where_clause += " AND p.status = :status"
        params["status"] = status
    
    q_str = f"SELECT * FROM technology_services.proposals p {where_clause} ORDER BY p.id DESC"
    res = await db.execute(text(q_str), params)
    return [dict(row._mapping) for row in res.all()]

@router.get("/proposals/{prop_id}")
async def get_proposal_by_id(
    prop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    q_str = "SELECT * FROM technology_services.proposals WHERE id = :id"
    res = await db.execute(text(q_str), {"id": prop_id})
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found")
        
    # Get sections
    sec_q = "SELECT * FROM technology_services.proposal_sections WHERE proposal_id = :prop_id ORDER BY order_index ASC"
    sec_res = await db.execute(text(sec_q), {"prop_id": prop_id})
    sections = [dict(r._mapping) for r in sec_res.all()]

    return {
        **dict(row._mapping),
        "sections": sections
    }

@router.post("/proposals")
async def create_proposal(
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    prop_id = uuid.uuid4()
    req_id = payload.get("request_id")
    qte_id = payload.get("quote_id")
    
    # Generate proposal template list if empty
    cnt_q = "SELECT COUNT(*) FROM technology_services.proposal_templates"
    cnt_res = await db.execute(text(cnt_q))
    if cnt_res.scalar() == 0:
        await db.execute(text("""
            INSERT INTO technology_services.proposal_templates (id, name, default_content_json, primary_color, logo_url)
            VALUES 
            ('3fa85f64-5717-4562-b3fc-2c963f66afa6', 'Standard Corporate Tech Template', '{"intro": "Thank you for choosing EventX."}', '#8B5CF6', '')
        """))

    # Set fields
    status = payload.get("status", "DRAFT")
    version = payload.get("version", "1.0")
    validity_date = payload.get("validity_date")
    if not validity_date:
        validity_date = (datetime.now() + timedelta(days=30)).date().isoformat()
    template_id = payload.get("template_id", "3fa85f64-5717-4562-b3fc-2c963f66afa6")

    # Insert proposal
    p_ins = """
    INSERT INTO technology_services.proposals 
    (id, request_id, quote_id, version, status, validity_date, prepared_by, template_id)
    VALUES 
    (:id, :request_id, :quote_id, :version, :status, :validity_date, :prepared_by, :template_id)
    """
    await db.execute(text(p_ins), {
        "id": prop_id,
        "request_id": uuid.UUID(req_id) if req_id else None,
        "quote_id": uuid.UUID(qte_id) if qte_id else None,
        "version": version,
        "status": status,
        "validity_date": validity_date,
        "prepared_by": current_user.id,
        "template_id": uuid.UUID(template_id)
    })

    # Insert default sections
    sections = payload.get("sections", [
        {"name": "Executive Summary", "content": "Welcome to our premium corporate proposals draft.", "order": 1},
        {"name": "Event Scope", "content": "Interactive session presentation rooms specifications mapping details.", "order": 2},
        {"name": "Deliverables", "content": "Registration laptops, routers and crew dispatch items schedule.", "order": 3},
        {"name": "Commercials", "content": "Cost summary projections.", "order": 4},
        {"name": "Terms & Conditions", "content": "All hardware rentals strictly adhere to standard SLA agreements.", "order": 5}
    ])

    for sec in sections:
        sec_ins = """
        INSERT INTO technology_services.proposal_sections 
        (id, proposal_id, section_name, content_richtext, page_number, order_index)
        VALUES 
        (:id, :proposal_id, :name, :content, :page, :idx)
        """
        await db.execute(text(sec_ins), {
            "id": uuid.uuid4(),
            "proposal_id": prop_id,
            "name": sec.get("name"),
            "content": sec.get("content"),
            "page": sec.get("order", 1),
            "idx": sec.get("order", 1)
        })

    # Initialize proposal documents list
    doc_types = ["Proposal (PDF)", "Bill of Quantity (BOQ) — Excel", "Quotation — PDF", "Technology Summary — PDF"]
    for doc in doc_types:
        await db.execute(text("""
            INSERT INTO technology_services.proposal_documents 
            (id, proposal_id, doc_type, file_name, file_url, file_size, version, status, generated_by, generated_at)
            VALUES 
            (:id, :proposal_id, :doc_type, :filename, '', 0, '1.0', 'PENDING', :user_id, :now)
        """), {
            "id": uuid.uuid4(),
            "proposal_id": prop_id,
            "doc_type": doc,
            "filename": f"{doc.split(' ')[0]}_Draft.pdf" if "PDF" in doc else "BOQ_Draft.xlsx",
            "user_id": current_user.id,
            "now": datetime.now(timezone.utc)
        })

    await log_activity(db, uuid.UUID(req_id) if req_id else prop_id, "PROPOSAL_CREATED", current_user.id, current_user.full_name, "Created proposal")
    await db.commit()
    return {"id": prop_id, "status": "success"}

@router.patch("/proposals/{prop_id}")
async def patch_proposal(
    prop_id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    
    # Retrieve proposal
    res = await db.execute(text("SELECT * FROM technology_services.proposals WHERE id = :id"), {"id": prop_id})
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found")

    status = payload.get("status", row.status)
    validity_date = payload.get("validity_date", row.validity_date)

    await db.execute(text("""
        UPDATE technology_services.proposals 
        SET status = :status, validity_date = :validity_date
        WHERE id = :id
    """), {
        "status": status,
        "validity_date": validity_date,
        "id": prop_id
    })

    # Update sections if passed
    sections = payload.get("sections")
    if sections is not None:
        await db.execute(text("DELETE FROM technology_services.proposal_sections WHERE proposal_id = :prop_id"), {"prop_id": prop_id})
        for sec in sections:
            sec_ins = """
            INSERT INTO technology_services.proposal_sections 
            (id, proposal_id, section_name, content_richtext, page_number, order_index)
            VALUES 
            (:id, :proposal_id, :name, :content, :page, :idx)
            """
            await db.execute(text(sec_ins), {
                "id": uuid.uuid4(),
                "proposal_id": prop_id,
                "name": sec.get("section_name"),
                "content": sec.get("content_richtext"),
                "page": sec.get("page_number", 1),
                "idx": sec.get("order_index", 1)
            })

    await db.commit()
    return {"status": "success"}

@router.get("/proposals/{prop_id}/documents")
async def list_proposal_documents(
    prop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    res = await db.execute(text("SELECT * FROM technology_services.proposal_documents WHERE proposal_id = :proposal_id"), {"proposal_id": prop_id})
    return [dict(r._mapping) for r in res.all()]

@router.post("/proposals/{prop_id}/documents/generate")
async def generate_proposal_documents(
    prop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    
    # Update status to PENDING
    await db.execute(text("""
        UPDATE technology_services.proposal_documents 
        SET status = 'PENDING', generated_at = :now
        WHERE proposal_id = :proposal_id
    """), {
        "proposal_id": prop_id,
        "now": datetime.now(timezone.utc)
    })
    await db.commit()

    # Start simulated async background task
    async def simulate_doc_gen():
        await asyncio.sleep(12)  # sleep 12s so client polling sees 'PENDING'
        # Re-open session and update to GENERATED
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as session:
            await session.execute(text("""
                UPDATE technology_services.proposal_documents 
                SET status = 'GENERATED', file_url = 'https://eventx-storage.s3.amazonaws.com/proposals/prop_boq.pdf', file_size = 1048576
                WHERE proposal_id = :proposal_id
            """), {"proposal_id": prop_id})
            await session.commit()
            
    asyncio.create_task(simulate_doc_gen())
    return {"status": "processing"}

@router.get("/proposals/{prop_id}/version-history")
async def list_proposal_versions(
    prop_id: uuid.UUID,
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    res = await db.execute(text("SELECT * FROM technology_services.proposal_versions WHERE proposal_id = :proposal_id ORDER BY created_at DESC"), {"proposal_id": prop_id})
    rows = res.all()
    if not rows:
        # insert initial dummy version record
        await db.execute(text("""
            INSERT INTO technology_services.proposal_versions (id, proposal_id, version_number, status, description, changes_count, created_by, created_at)
            VALUES (:id, :proposal_id, '1.0', 'DRAFT', 'Initial Version Draft', 0, '3fa85f64-5717-4562-b3fc-2c963f66afa6', :now)
        """), {"id": uuid.uuid4(), "proposal_id": prop_id, "now": datetime.now(timezone.utc)})
        await db.commit()
        res = await db.execute(text("SELECT * FROM technology_services.proposal_versions WHERE proposal_id = :proposal_id ORDER BY created_at DESC"), {"proposal_id": prop_id})
        rows = res.all()
        
    return [dict(r._mapping) for r in rows]

@router.post("/proposals/{prop_id}/versions")
async def create_proposal_version(
    prop_id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    
    # Retrieve proposal
    res = await db.execute(text("SELECT * FROM technology_services.proposals WHERE id = :id"), {"id": prop_id})
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Proposal not found")

    curr_ver = row.version
    try:
        next_ver = f"{float(curr_ver) + 1.0:.1f}"
    except ValueError:
        next_ver = "2.0"

    await db.execute(text("""
        INSERT INTO technology_services.proposal_versions (id, proposal_id, version_number, status, description, changes_count, created_by, created_at)
        VALUES (:id, :proposal_id, :version_number, 'APPROVED', :description, :changes, :created_by, :now)
    """), {
        "id": uuid.uuid4(),
        "proposal_id": prop_id,
        "version_number": next_ver,
        "description": payload.get("description", "Minor Updates"),
        "changes": int(payload.get("changes_count", 1)),
        "created_by": current_user.id,
        "now": datetime.now(timezone.utc)
    })

    # Update proposal table version
    await db.execute(text("UPDATE technology_services.proposals SET version = :ver WHERE id = :id"), {"ver": next_ver, "id": prop_id})
    await db.commit()
    return {"status": "success", "new_version": next_ver}

@router.get("/pricing-rules-catalog")
async def list_pricing_rules_catalog(
    db: AsyncSession = Depends(get_db)
):
    await ensure_schemas(db)
    
    cnt_q = "SELECT COUNT(*) FROM technology_services.pricing_rules"
    cnt_res = await db.execute(text(cnt_q))
    if cnt_res.scalar() == 0:
        await db.execute(text("""
            INSERT INTO technology_services.pricing_rules (id, name, category, markup_type, markup_value, applies_to)
            VALUES 
            ('4fa85f64-5717-4562-b3fc-2c963f66afa6', 'Early Bird Discount', 'HARDWARE', 'PERCENTAGE_DISCOUNT', 10.0, 'ALL_HARDWARE'),
            ('5fa85f64-5717-4562-b3fc-2c963f66afa7', 'Premium Staffing Surcharge', 'STAFF', 'PERCENTAGE_MARKUP', 15.0, 'SUPERVISOR')
        """))
        await db.commit()

    res = await db.execute(text("SELECT * FROM technology_services.pricing_rules"))
    return [dict(r._mapping) for r in res.all()]

@router.post("/proposals/{prop_id}/share")
async def create_share_link(
    prop_id: uuid.UUID,
    payload: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    await ensure_schemas(db)
    token = str(uuid.uuid4())
    expires_in_hours = int(payload.get("expires_in_hours", 24))
    expires_at = datetime.now(timezone.utc) + timedelta(hours=expires_in_hours)
    
    await db.execute(text("""
        INSERT INTO technology_services.proposal_share_links (id, proposal_id, token, expires_at, viewed_at, created_by)
        VALUES (:id, :proposal_id, :token, :expires_at, NULL, :created_by)
    """), {
        "id": uuid.uuid4(),
        "proposal_id": prop_id,
        "token": token,
        "expires_at": expires_at,
        "created_by": current_user.id
    })
    await db.commit()
    return {"token": token, "expires_at": expires_at.isoformat()}
