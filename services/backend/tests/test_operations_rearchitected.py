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
from app.modules.technology_services.models import (
    ServiceRequest, ServiceRequestItem, ServiceLevel, ServiceSlaPolicy, ServiceSlaTarget, ServiceSlaBreach,
    RequirementTemplate, RequirementFormTemplate, RequirementFormField, RequirementResponse, RequestAssignment
)
from app.modules.operations_planning.models import (
    Project, Milestone, ProjectTask, ProjectTemplate, ProjectTemplateTask,
    EventTimeline, TimelineMilestone, ProjectVendor, ProjectBlocker
)
from app.modules.resource_management.models import (
    ResourcePlan, ResourceAllocation, StaffAssignment, EquipmentAssignment, TravelPlan,
    ResourceAvailability, EmployeeCalendar, EquipmentCalendar, TravelBooking, HotelBooking, TransportBooking
)
from app.modules.deployment_management.models import (
    Deployment, DeploymentChecklist, DeploymentLog, ReadinessScore, Risk,
    DeploymentRunbook, DeploymentStep, Issue, RiskAction, ProjectCost, ProjectActual, ProjectProfitability, ProjectActualCost
)

@pytest.mark.asyncio
async def test_rearchitected_operations_flow(client: AsyncClient, super_admin: User, event: Event, db: AsyncSession):
    headers = auth_headers(super_admin)

    # 1. Seed Dynamic Form Template & Fields
    req_template = RequirementTemplate(
        id=uuid.uuid4(),
        name=f"Streaming Template {uuid.uuid4()}",
        description="Standard configuration fields for webcasts"
    )
    db.add(req_template)
    await db.flush()

    form_template = RequirementFormTemplate(
        id=uuid.uuid4(),
        template_id=req_template.id,
        version=1,
        is_active=True
    )
    db.add(form_template)
    await db.flush()

    form_field = RequirementFormField(
        id=uuid.uuid4(),
        form_template_id=form_template.id,
        field_name="symmetric_mbps",
        label="Required Bandwidth (Mbps)",
        field_type="number",
        is_required=True,
        field_config={"min": 10, "max": 1000},
        sort_order=1
    )
    db.add(form_field)
    await db.flush()

    # 2. Seed SLA Policies
    srv_level = ServiceLevel(
        id=uuid.uuid4(),
        name=f"Gold Tier Support {uuid.uuid4()}",
        description="Priority support with fast resolution"
    )
    db.add(srv_level)
    await db.flush()

    sla_policy = ServiceSlaPolicy(
        id=uuid.uuid4(),
        service_level_id=srv_level.id,
        request_priority="HIGH",
        response_time_hours=2,
        resolution_time_hours=24
    )
    db.add(sla_policy)
    await db.flush()

    # 3. Create a Service Request with updated status enums
    service_request = ServiceRequest(
        id=uuid.uuid4(),
        organization_id=super_admin.organization_id,
        event_id=event.id,
        request_number=f"REQ-{uuid.uuid4().hex[:8].upper()}",
        title="Webcast Stream Setup for General Assembly",
        description="Live encoder streaming and high speed connection requirements",
        status="TRIAGED", # updated status
        priority="HIGH",
        request_type="STREAMING",
        requested_by=super_admin.id
    )
    db.add(service_request)
    await db.flush()

    # Create Dynamic Form Response for request
    req_response = RequirementResponse(
        id=uuid.uuid4(),
        request_id=service_request.id,
        field_id=form_field.id,
        value_json={"value": 100}
    )
    db.add(req_response)
    await db.flush()

    # Assign internal handler
    assignment = RequestAssignment(
        id=uuid.uuid4(),
        request_id=service_request.id,
        assigned_to=super_admin.id,
        assigned_by=super_admin.id,
        role="AV Lead Engineer",
        status="ACTIVE"
    )
    db.add(assignment)
    await db.flush()

    # Setup SLA Target
    sla_target = ServiceSlaTarget(
        id=uuid.uuid4(),
        request_id=service_request.id,
        policy_id=sla_policy.id,
        response_deadline=datetime.now(timezone.utc) + timedelta(hours=2),
        resolution_deadline=datetime.now(timezone.utc) + timedelta(hours=24)
    )
    db.add(sla_target)
    await db.flush()

    # 4. Operations Planning - Project Templates
    proj_template = ProjectTemplate(
        id=uuid.uuid4(),
        name=f"Standard AV Setup {uuid.uuid4()}",
        description="Tasks blueprint for general presentation halls"
    )
    db.add(proj_template)
    await db.flush()

    template_task = ProjectTemplateTask(
        id=uuid.uuid4(),
        template_id=proj_template.id,
        title="Verify Network Bandwidth",
        description="Perform speed tests on main room switch",
        relative_due_days=3,
        priority="HIGH"
    )
    db.add(template_task)
    await db.flush()

    # Instantiate Internal Project from Request
    project = Project(
        id=uuid.uuid4(),
        organization_id=super_admin.organization_id,
        event_id=event.id,
        service_request_id=service_request.id,
        project_code=f"PRJ-AV-{uuid.uuid4().hex[:6].upper()}",
        name="Main Room AV Project Node",
        status="PLANNING",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
        project_manager_id=super_admin.id,
        completion_percentage=0.0
    )
    db.add(project)
    await db.flush()

    # Create Project tasks
    task = ProjectTask(
        id=uuid.uuid4(),
        project_id=project.id,
        assigned_to=super_admin.id,
        title=template_task.title,
        description=template_task.description,
        status="TODO",
        priority=template_task.priority,
        start_date=date.today(),
        due_date=date.today() + timedelta(days=template_task.relative_due_days)
    )
    db.add(task)
    await db.flush()

    # 5. Resource Scheduling with Availability Check
    staff_role = StaffRole(
        id=uuid.uuid4(),
        role_name=f"AV Tech Lead {uuid.uuid4()}",
        description="Senior AV technician in charge of room setups"
    )
    db.add(staff_role)
    await db.flush()

    # Check / reserve calendar slot (Availability Engine)
    emp_cal = EmployeeCalendar(
        id=uuid.uuid4(),
        employee_id=super_admin.id,
        date=date.today(),
        allocated_hours=8.0,
        event_id=event.id
    )
    db.add(emp_cal)
    await db.flush()

    staff_assign = StaffAssignment(
        id=uuid.uuid4(),
        project_id=project.id,
        employee_id=super_admin.id,
        role_id=staff_role.id,
        allocation_percentage=100.0,
        hours_allocated=8.0,
        start_date=date.today(),
        end_date=date.today()
    )
    db.add(staff_assign)
    await db.flush()

    # 6. Readiness Engine expanded scores calculation
    readiness = ReadinessScore(
        id=uuid.uuid4(),
        project_id=project.id,
        technology_score=90.0,
        network_score=85.0,
        staff_score=100.0,
        equipment_score=95.0,
        content_score=80.0,
        venue_score=90.0,
        compliance_score=95.0,
        overall_score=91.0
    )
    db.add(readiness)
    await db.flush()

    # 7. Financial margin & profitability actuals tracking
    est_cost = ProjectCost(
        id=uuid.uuid4(),
        project_id=project.id,
        category="STAFF",
        estimated_amount=1200.0,
        actual_amount=0.0
    )
    db.add(est_cost)
    await db.flush()

    actual_item = ProjectActualCost(
        id=uuid.uuid4(),
        project_id=project.id,
        cost_item="Crew Day Rate Payment",
        category="STAFF",
        amount=1150.0,
        invoice_reference="INV-2026-009"
    )
    db.add(actual_item)
    await db.flush()

    profitability = ProjectProfitability(
        id=uuid.uuid4(),
        project_id=project.id,
        total_revenue=2500.0,
        total_estimated_costs=1200.0,
        total_actual_costs=1150.0,
        gross_profit=1350.0,
        margin_percentage=54.0
    )
    db.add(profitability)
    await db.commit()

    # Verify everything persists correctly
    q = select(Project).where(Project.id == project.id)
    res_proj = (await db.execute(q)).scalar_one()
    assert res_proj is not None
    assert res_proj.status == "PLANNING"
    assert res_proj.completion_percentage == 0.0

    q_readiness = select(ReadinessScore).where(ReadinessScore.project_id == project.id)
    res_readiness = (await db.execute(q_readiness)).scalar_one()
    assert res_readiness.compliance_score == 95.0
    assert res_readiness.content_score == 80.0

    q_profit = select(ProjectProfitability).where(ProjectProfitability.project_id == project.id)
    res_profit = (await db.execute(q_profit)).scalar_one()
    assert res_profit.gross_profit == 1350.0
