import pytest
import uuid
from datetime import date, datetime, timedelta, timezone
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from tests.conftest import auth_headers

from app.modules.events.models.event import Event
from app.modules.identity.models.user import User
from app.modules.commercial.models import StaffRole, ServiceCategory, Service
from app.modules.inventory.models import HardwareCategory, HardwareItem, HardwareStock
from app.modules.platform.models.organization import Organization


@pytest.mark.asyncio
async def test_service_request_projections_enforce_event_tenant_scope(
    client: AsyncClient,
    organizer: User,
    super_admin: User,
    db: AsyncSession,
):
    foreign_org = Organization(
        name="Foreign Projection Org",
        slug=f"foreign-projection-{uuid.uuid4().hex[:8]}",
        plan="pro",
    )
    db.add(foreign_org)
    await db.flush()
    foreign_event = Event(
        organization_id=foreign_org.id,
        created_by=super_admin.id,
        name="Foreign Conference",
        short_code=f"FC{uuid.uuid4().hex[:4].upper()}",
        location="Foreign City",
        venue_name="Foreign Hall",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 2),
        timezone="UTC",
        status="draft",
        max_file_size_mb=500,
        allowed_formats=["pptx", "pdf"],
    )
    db.add(foreign_event)
    await db.flush()

    organizer_response = await client.get(
        f"/service-requests/kpi-strip?event_id={foreign_event.id}",
        headers=auth_headers(organizer),
    )
    assert organizer_response.status_code == 404

    admin_response = await client.get(
        f"/service-requests/kpi-strip?event_id={foreign_event.id}&organization_id={foreign_org.id}",
        headers=auth_headers(super_admin),
    )
    assert admin_response.status_code == 200
    assert admin_response.json() == {"total": 0, "open": 0, "status_counts": {}}

@pytest.mark.asyncio
async def test_ops_planning_flow(client: AsyncClient, super_admin: User, event: Event, db: AsyncSession):
    headers = auth_headers(super_admin)
    
    # ── 0. Seed Required Supporting Data ──
    # Create Staff Role
    staff_role = StaffRole(
        id=uuid.uuid4(),
        role_name=f"AV Tech Lead {uuid.uuid4()}",
        description="Senior AV technician in charge of room setups"
    )
    db.add(staff_role)

    # Create Service Category
    srv_category = ServiceCategory(
        id=uuid.uuid4(),
        name=f"AV Services {uuid.uuid4()}",
        description="Audio visual setup services"
    )
    db.add(srv_category)
    await db.flush()

    # Create Service Catalog item
    srv_item = Service(
        id=uuid.uuid4(),
        category_id=srv_category.id,
        service_code=f"SRV-AV-{uuid.uuid4().hex[:6].upper()}",
        service_name="Standard Projector and Mic Rental",
        description="Rental of standard projector and microphones",
        unit_type="item",
        is_active=True
    )
    db.add(srv_item)
    
    # Create Hardware Category
    hw_category = HardwareCategory(
        id=uuid.uuid4(),
        name=f"Audio Equipment {uuid.uuid4()}",
        description="Microphones, speakers, mixers"
    )
    db.add(hw_category)
    await db.flush()
    
    # Create Hardware Item
    hw_item = HardwareItem(
        id=uuid.uuid4(),
        category_id=hw_category.id,
        asset_code=f"MIC-LAPEL-{uuid.uuid4().hex[:6].upper()}",
        name="Wireless Lapel Microphone",
        brand="Shure",
        model="SLX-D",
        status="AVAILABLE"
    )
    db.add(hw_item)
    await db.flush()
    
    # Create Hardware Stock
    hw_stock = HardwareStock(
        id=uuid.uuid4(),
        hardware_id=hw_item.id,
        quantity=5,
        reserved_quantity=0,
        available_quantity=5
    )
    db.add(hw_stock)
    await db.commit()

    # ── 1. Technology Service Request Endpoints ──
    req_payload = {
        "title": "Main Hall Audio & Visual Setup",
        "description": "Standard speaker ready room and session setup",
        "priority": "HIGH",
        "request_type": "SESSION_ROOM_TECH",
        "items": [
            {"service_id": str(srv_item.id), "quantity": 2, "configuration": {}, "notes": "need standard mics"}
        ],
        "requirements": [
            {"requirement_type": "AUDIO", "requirement_data": {"specification_details": "4 wireless lapel microphones"}}
        ]
    }
    
    resp = await client.post(
        f"/service-requests?event_id={event.id}",
        json=req_payload,
        headers=headers
    )

    assert resp.status_code == 200, resp.text
    req_data = resp.json()
    assert req_data["title"] == "Main Hall Audio & Visual Setup"
    assert req_data["status"] == "DRAFT"
    
    req_id = req_data["id"]

    # Static projection routes must not be captured by /{request_id}.
    resp = await client.get(f"/service-requests/kpi-strip?event_id={event.id}", headers=headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 1
    assert resp.json()["status_counts"]["DRAFT"] == 1

    resp = await client.get(
        f"/service-requests/kanban-columns?event_id={event.id}&limit=10&offset=0",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text
    draft = next(column for column in resp.json()["columns"] if column["key"] == "draft")
    assert draft["count"] == 1
    assert draft["cards"][0]["request_number"] == req_data["request_number"]
    assert "estimated_value" not in draft["cards"][0]
    assert "staff_count" not in draft["cards"][0]
    
    # Submit Request
    resp = await client.post(f"/service-requests/{req_id}/submit", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "SUBMITTED"
    
    # Approve Request
    resp = await client.post(f"/service-requests/{req_id}/approve", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "IN_PROGRESS"

    resp = await client.get(
        f"/service-requests/kanban-columns?event_id={event.id}&limit=10&offset=0",
        headers=headers,
    )
    assert resp.status_code == 200
    in_progress = next(column for column in resp.json()["columns"] if column["key"] == "in_progress")
    assert in_progress["count"] == 1
    assert in_progress["cards"][0]["id"] == req_id

    # Get Single Request
    resp = await client.get(f"/service-requests/{req_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "IN_PROGRESS"


    # List Requests
    resp = await client.get(f"/service-requests?event_id={event.id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # ── 2. Operations Projects, Milestones & Tasks Endpoints ──
    project_payload = {
        "name": "Audio Visual Deployment Project",
        "service_request_id": req_id,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=5)),
        "project_manager_id": str(super_admin.id)
    }
    resp = await client.post(
        f"/operations/projects?event_id={event.id}",
        json=project_payload,
        headers=headers
    )
    assert resp.status_code == 200, resp.text
    project_data = resp.json()
    assert project_data["name"] == "Audio Visual Deployment Project"
    
    project_id = project_data["id"]
    
    # Verify autogenerated milestones and tasks
    assert len(project_data["milestones"]) > 0
    assert len(project_data["tasks"]) > 0
    
    # List Projects
    resp = await client.get(f"/operations/projects?event_id={event.id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1
    
    # Update Project
    resp = await client.patch(
        f"/operations/projects/{project_id}",
        json={"status": "PLANNING"},
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "PLANNING"

    # Create manual milestone
    milestone_payload = [
        {
            "name": "On-Site Validation Milestone",
            "description": "Double check all configurations physically",
            "start_date": str(date.today() + timedelta(days=1)),
            "due_date": str(date.today() + timedelta(days=2))
        }
    ]
    resp = await client.post(
        f"/operations/projects/{project_id}/milestones",
        json=milestone_payload,
        headers=headers
    )
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Create manual task
    # Wait, the endpoint uses query project_id and body for req. Let's test with body
    task_payload = {
        "title": "Configure Wireless Access Points",
        "description": "Ensure isolation for internal staff network",
        "status": "TODO",
        "priority": "HIGH",
        "start_date": str(date.today()),
        "due_date": str(date.today() + timedelta(days=2))
    }
    # Note: in operations/router.py, it defines create_task as:
    # @router.post("/tasks", response_model=ProjectTaskOut)
    # async def create_task(project_id: uuid.UUID = Query(...), req: ProjectTaskCreate = Depends())
    # Let's send the parameters as query params if it uses Depends()
    resp = await client.post(
        f"/operations/tasks?project_id={project_id}&title=Configure Wireless Access Points&priority=HIGH&status=TODO",
        headers=headers
    )
    assert resp.status_code == 200, resp.text
    task_data = resp.json()
    assert task_data["title"] == "Configure Wireless Access Points"
    task_id = task_data["id"]

    # List Tasks
    resp = await client.get(f"/operations/tasks?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Update Task Status to COMPLETED
    resp = await client.patch(
        f"/operations/tasks/{task_id}",
        json={"status": "COMPLETED"},
        headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "COMPLETED"

    # Verify project completion percentage recalculated
    resp = await client.get(f"/operations/projects/{project_id}", headers=headers)
    assert resp.status_code == 200
    project_json = resp.json()
    print("DEBUG PROJECT DETAIL:", project_json)
    assert float(project_json["completion_percentage"]) > 0.0

    # ── 3. Resource Management Endpoints ──
    # Create Resource Plan
    resp = await client.post(
        f"/resource-management/plans?project_id={project_id}",
        json={"name": "AV Deployment Resource Plan", "description": "Staffing and hardware budget"},
        headers=headers
    )
    assert resp.status_code == 200
    plan_id = resp.json()["id"]

    # Assign Staff
    staff_payload = {
        "employee_id": str(super_admin.id),
        "role_id": str(staff_role.id),
        "allocation_percentage": 50.0,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=5))
    }
    resp = await client.post(
        f"/resource-management/staff-assignments?project_id={project_id}",
        json=staff_payload,
        headers=headers
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["employee_id"] == str(super_admin.id)

    # Assign Equipment
    equipment_payload = {
        "hardware_id": str(hw_item.id),
        "quantity": 2,
        "start_date": str(date.today()),
        "end_date": str(date.today() + timedelta(days=5))
    }
    resp = await client.post(
        f"/resource-management/equipment-assignments?project_id={project_id}",
        json=equipment_payload,
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["hardware_id"] == str(hw_item.id)

    # Create Travel Plan
    travel_payload = {
        "employee_id": str(super_admin.id),
        "city": "Mumbai",
        "hotel": "JW Marriott",
        "arrival_date": str(date.today()),
        "departure_date": str(date.today() + timedelta(days=5))
    }
    resp = await client.post(
        f"/resource-management/travel-plans?project_id={project_id}",
        json=travel_payload,
        headers=headers
    )
    assert resp.status_code == 200
    travel_id = resp.json()["id"]

    # Update Travel Plan
    resp = await client.patch(
        f"/resource-management/travel-plans/{travel_id}",
        json={"status": "BOOKED"},
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "BOOKED"

    # List Allocations
    resp = await client.get(f"/resource-management/allocations?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 2

    # Run Conflict Detection
    resp = await client.post(f"/resource-management/conflicts/detect?project_id={project_id}", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "success"

    # ── 4. Deployment Management Endpoints ──
    # Create Deployment
    deploy_payload = {
        "deployment_number": "DEP-001",
        "deployment_date": str(date.today() + timedelta(days=4)),
        "deployment_status": "PLANNED"
    }
    resp = await client.post(
        f"/deployments?project_id={project_id}",
        json=deploy_payload,
        headers=headers
    )
    assert resp.status_code == 200
    deploy_id = resp.json()["id"]

    # List checklists
    resp = await client.get(f"/deployments/{deploy_id}/checklists", headers=headers)
    assert resp.status_code == 200
    checklists = resp.json()
    assert len(checklists) > 0
    checklist_id = checklists[0]["id"]

    # Update Checklist status
    resp = await client.patch(
        f"/deployments/checklists/{checklist_id}?status=COMPLETED",
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "COMPLETED"

    # Get Readiness score
    resp = await client.get(f"/deployments/projects/{project_id}/readiness", headers=headers)
    assert resp.status_code == 200
    score_data = resp.json()
    assert "overall_score" in score_data
    assert "technology_score" in score_data

    # Complete Deployment
    resp = await client.post(f"/deployments/{deploy_id}/complete", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["deployment_status"] == "SUCCESS"

    # Create Risk
    risk_payload = {
        "title": "Bandwidth Fluctuations",
        "description": "Peak congestion during keynote sessions",
        "severity": "HIGH",
        "probability": "MEDIUM",
        "mitigation_plan": "Provision a secondary bonded cellular backup link",
        "status": "IDENTIFIED"
    }
    resp = await client.post(
        f"/deployments/projects/{project_id}/risks",
        json=risk_payload,
        headers=headers
    )
    assert resp.status_code == 200
    risk_id = resp.json()["id"]

    # List Risks
    resp = await client.get(f"/deployments/projects/{project_id}/risks", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) >= 1

    # Update Risk
    resp = await client.patch(
        f"/deployments/risks/{risk_id}",
        json={"status": "MITIGATED"},
        headers=headers
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "MITIGATED"
