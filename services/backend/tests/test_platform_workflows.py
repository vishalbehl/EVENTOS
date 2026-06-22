import pytest
import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from httpx import AsyncClient

from tests.conftest import auth_headers
from app.modules.identity.models.user import User
from app.modules.platform_workflows.workflows.models import ApprovalWorkflow, ApprovalWorkflowStep, ApprovalStepApprover
from app.modules.platform_workflows.instances.models import ApprovalInstance, ApprovalInstanceStep
from app.modules.platform_workflows.delegations.models import ApprovalDelegation
from app.modules.platform_workflows.history.models import ApprovalHistory
from app.tasks.workflow_jobs import _check_expired_approvals_async, _check_escalations_async, _send_reminders_async

@pytest.mark.asyncio
async def test_workflow_template_crud_and_clone(client: AsyncClient, db: AsyncSession, organization, organizer):
    # Ensure organizer is treated as platform admin for this test
    organizer.is_platform_admin = True
    await db.flush()
    headers = auth_headers(organizer)

    # 1. Create Workflow Template
    payload = {
        "name": "Enterprise Discount Workflow",
        "code": "ENT_DISCOUNT",
        "description": "Approval workflow for subscription discounts > 20%",
        "module": "billing",
        "entity_type": "subscription_discount",
        "is_system": False,
        "is_active": False,
        "trigger_event": "create",
        "conditions": [
            {
                "field_name": "discount_pct",
                "operator": ">",
                "value": "20",
                "logical_operator": "AND"
            }
        ],
        "steps": [
            {
                "step_order": 1,
                "name": "Finance Review",
                "description": "Verification of gross margins",
                "approval_type": "ANYONE",
                "assignment_type": "USER",
                "minimum_approvals": 1,
                "allow_rejection": True,
                "allow_return": True,
                "allow_skip": False,
                "escalation_hours": 24,
                "timeout_hours": 48,
                "is_final": False,
                "approvers": [
                    {
                        "user_id": str(organizer.id)
                    }
                ]
            },
            {
                "step_order": 2,
                "name": "VP Approval",
                "description": "Executive signoff",
                "approval_type": "ANYONE",
                "assignment_type": "USER",
                "minimum_approvals": 1,
                "allow_rejection": True,
                "allow_return": True,
                "allow_skip": False,
                "escalation_hours": None,
                "timeout_hours": None,
                "is_final": True,
                "approvers": [
                    {
                        "user_id": str(organizer.id)
                    }
                ]
            }
        ]
    }

    response = await client.post("/api/v1/platform/workflows", json=payload, headers=headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == payload["name"]
    assert len(data["steps"]) == 2
    assert data["steps"][0]["name"] == "Finance Review"
    assert len(data["conditions"]) == 1
    workflow_id = data["id"]

    # 2. Get Workflow
    response = await client.get(f"/api/v1/platform/workflows/{workflow_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["name"] == payload["name"]

    # 3. Update Workflow (Publish)
    update_payload = {"is_active": True}
    response = await client.patch(f"/api/v1/platform/workflows/{workflow_id}", json=update_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["is_active"] is True

    # 4. Clone Workflow
    response = await client.post(f"/api/v1/platform/workflows/{workflow_id}/clone", headers=headers)
    assert response.status_code == 201
    cloned_data = response.json()
    assert cloned_data["name"] == "Enterprise Discount Workflow (Clone)"
    assert cloned_data["code"] == "ENT_DISCOUNT_CLONE"
    assert cloned_data["id"] != workflow_id

    # 5. List Workflows
    response = await client.get("/api/v1/platform/workflows", headers=headers)
    assert response.status_code == 200
    wfs = response.json()
    assert len(wfs) >= 2

    # 6. Delete Original Workflow
    response = await client.delete(f"/api/v1/platform/workflows/{workflow_id}", headers=headers)
    assert response.status_code == 204

@pytest.mark.asyncio
async def test_workflow_execution_approval_and_rejection(client: AsyncClient, db: AsyncSession, organization, organizer):
    organizer.is_platform_admin = True
    await db.flush()
    headers = auth_headers(organizer)

    # Create active workflow template
    payload = {
        "name": "Refund Approval Workflow",
        "code": "REFUND_WF",
        "description": "Approval for refunds",
        "module": "billing",
        "entity_type": "refund",
        "is_system": False,
        "is_active": True,
        "trigger_event": "create",
        "conditions": [],
        "steps": [
            {
                "step_order": 1,
                "name": "Manager Review",
                "description": "Initial signoff",
                "approval_type": "ANYONE",
                "assignment_type": "USER",
                "minimum_approvals": 1,
                "allow_rejection": True,
                "allow_return": True,
                "allow_skip": False,
                "escalation_hours": 12,
                "timeout_hours": 24,
                "is_final": True,
                "approvers": [
                    {
                        "user_id": str(organizer.id)
                    }
                ]
            }
        ]
    }
    response = await client.post("/api/v1/platform/workflows", json=payload, headers=headers)
    assert response.status_code == 201
    workflow_id = response.json()["id"]

    # 1. Start Approval Run
    start_payload = {
        "workflow_id": workflow_id,
        "entity_type": "refund",
        "entity_id": str(uuid.uuid4()),
        "entity_data": {"amount": 500}
    }
    response = await client.post("/api/v1/platform/approvals/start", json=start_payload, headers=headers)
    assert response.status_code == 201
    inst_data = response.json()
    assert inst_data["status"] == "IN_PROGRESS"
    assert len(inst_data["steps"]) == 1
    step_id = inst_data["steps"][0]["id"]
    instance_id = inst_data["id"]

    # 2. Check Inbox
    response = await client.get("/api/v1/platform/approvals/inbox", headers=headers)
    assert response.status_code == 200
    inbox = response.json()
    assert len(inbox) >= 1
    assert any(item["id"] == step_id for item in inbox)

    # 3. Approve Step
    approve_payload = {"comments": "Refund verified."}
    response = await client.post(f"/api/v1/platform/approvals/{step_id}/approve", json=approve_payload, headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Reload Instance
    response = await client.get(f"/api/v1/platform/approvals/instances/{instance_id}", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "COMPLETED"

    # 4. Start another instance to test Rejection
    start_payload["entity_id"] = str(uuid.uuid4())
    response = await client.post("/api/v1/platform/approvals/start", json=start_payload, headers=headers)
    assert response.status_code == 201
    inst_data2 = response.json()
    step_id2 = inst_data2["steps"][0]["id"]
    instance_id2 = inst_data2["id"]

    # Reject step
    reject_payload = {"comments": "Too high refund amount."}
    response = await client.post(f"/api/v1/platform/approvals/{step_id2}/reject", json=reject_payload, headers=headers)
    assert response.status_code == 200

    # Verify Instance is REJECTED
    response = await client.get(f"/api/v1/platform/approvals/instances/{instance_id2}", headers=headers)
    assert response.status_code == 200
    assert response.json()["status"] == "REJECTED"

@pytest.mark.asyncio
async def test_delegations_and_escalations(client: AsyncClient, db: AsyncSession, organization, organizer):
    organizer.is_platform_admin = True
    await db.flush()
    headers = auth_headers(organizer)

    # Create another user to delegate to
    delegate_user = User(
        id=uuid.uuid4(),
        organization_id=organization.id,
        email="delegate@test.com",
        first_name="John",
        last_name="Delegate",
        role="organiser",
        is_active=True
    )
    db.add(delegate_user)
    await db.flush()

    # 1. Create Delegation Rule
    del_payload = {
        "to_user_id": str(delegate_user.id),
        "start_date": datetime.now(timezone.utc).isoformat(),
        "end_date": (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
    }
    response = await client.post("/api/v1/platform/approvals/delegations", json=del_payload, headers=headers)
    assert response.status_code == 201
    del_id = response.json()["id"]

    # 2. Get Delegations
    response = await client.get("/api/v1/platform/approvals/delegations", headers=headers)
    assert response.status_code == 200
    assert len(response.json()) >= 1

    # 3. Create workflow that assigns to organizer (should delegate to delegate_user)
    payload = {
        "name": "Delegation Test",
        "code": "DELEGATION_WF",
        "module": "billing",
        "entity_type": "access",
        "is_system": False,
        "is_active": True,
        "steps": [
            {
                "step_order": 1,
                "name": "Auth Review",
                "assignment_type": "USER",
                "minimum_approvals": 1,
                "approvers": [{"user_id": str(organizer.id)}]
            }
        ]
    }
    response = await client.post("/api/v1/platform/workflows", json=payload, headers=headers)
    wf_id = response.json()["id"]

    # Start instance
    start_payload = {
        "workflow_id": wf_id,
        "entity_type": "access",
        "entity_id": str(uuid.uuid4()),
        "entity_data": {}
    }
    response = await client.post("/api/v1/platform/approvals/start", json=start_payload, headers=headers)
    assert response.status_code == 201
    inst_step = response.json()["steps"][0]
    # Check that it's assigned to delegate_user due to active delegation
    assert inst_step["assigned_to"] == str(delegate_user.id)

    # 4. Test Manual Escalation
    esc_payload = {
        "reason": "Out of office, escalating to delegate",
        "escalated_to": str(delegate_user.id)
    }
    response = await client.post(f"/api/v1/platform/approvals/{inst_step['id']}/escalate", json=esc_payload, headers=headers)
    assert response.status_code == 200

    # 5. Revoke delegation
    response = await client.delete(f"/api/v1/platform/approvals/delegations/{del_id}", headers=headers)
    assert response.status_code == 204

@pytest.mark.asyncio
async def test_celery_workflow_jobs_logic(client: AsyncClient, db: AsyncSession, organization, organizer):
    # Mock db.commit to avoid closing the transaction during test execution
    original_commit = db.commit
    async def mock_commit():
        await db.flush()
    db.commit = mock_commit

    # Mock AsyncSessionLocal inside tasks module to share the same test session
    import app.tasks.workflow_jobs
    class LocalSessionWrapper:
        def __init__(self, session):
            self.session = session
        async def __aenter__(self):
            return self.session
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass
            
    original_tasks_sessionmaker = app.tasks.workflow_jobs.AsyncSessionLocal
    app.tasks.workflow_jobs.AsyncSessionLocal = lambda: LocalSessionWrapper(db)

    # Setup step instance that is expired
    workflow = ApprovalWorkflow(
        id=uuid.uuid4(),
        organization_id=organization.id,
        name="Job Test Workflow",
        code="JOB_WF",
        module="billing",
        entity_type="job_test",
        version=1,
        is_active=True
    )
    wf_step = ApprovalWorkflowStep(
        id=uuid.uuid4(),
        workflow_id=workflow.id,
        step_order=1,
        name="Job Step",
        assignment_type="USER",
        timeout_hours=1,
        escalation_hours=1,
        is_final=True
    )
    db.add(workflow)
    db.add(wf_step)
    await db.flush()

    instance = ApprovalInstance(
        id=uuid.uuid4(),
        organization_id=organization.id,
        workflow_id=workflow.id,
        entity_type="job_test",
        entity_id=uuid.uuid4(),
        status="IN_PROGRESS",
        current_step_id=wf_step.id,
        started_by=organizer.id,
        started_at=datetime.now(timezone.utc) - timedelta(hours=3)
    )
    step_instance = ApprovalInstanceStep(
        id=uuid.uuid4(),
        instance_id=instance.id,
        workflow_step_id=wf_step.id,
        status="PENDING",
        assigned_to=organizer.id,
        due_at=datetime.now(timezone.utc) - timedelta(hours=1)
    )
    db.add(instance)
    db.add(step_instance)
    await db.flush()

    # Store IDs for reloading without accessing expired attributes
    step_id = step_instance.id
    inst_id = instance.id

    # 1. Run Expired Jobs
    await _check_expired_approvals_async()

    # Verify step status was marked as EXPIRED using async select
    res_step = await db.execute(select(ApprovalInstanceStep).where(ApprovalInstanceStep.id == step_id))
    reloaded_step = res_step.scalar_one()
    assert reloaded_step.status == "EXPIRED"

    # Reload instance and verify status is EXPIRED
    res_inst = await db.execute(select(ApprovalInstance).where(ApprovalInstance.id == inst_id))
    reloaded_inst = res_inst.scalar_one()
    assert reloaded_inst.status == "EXPIRED"

    # 2. Run Escalations (setup another step to be escalated)
    instance2 = ApprovalInstance(
        id=uuid.uuid4(),
        organization_id=organization.id,
        workflow_id=workflow.id,
        entity_type="job_test",
        entity_id=uuid.uuid4(),
        status="IN_PROGRESS",
        current_step_id=wf_step.id,
        started_by=organizer.id,
        started_at=datetime.now(timezone.utc) - timedelta(hours=3)
    )
    step_instance2 = ApprovalInstanceStep(
        id=uuid.uuid4(),
        instance_id=instance2.id,
        workflow_step_id=wf_step.id,
        status="PENDING",
        assigned_to=organizer.id,
        due_at=datetime.now(timezone.utc) + timedelta(hours=2)
    )
    db.add(instance2)
    db.add(step_instance2)
    await db.flush()

    # Set organizer is_platform_admin = True so they are found as platform admin for escalation
    organizer.is_platform_admin = True
    await db.flush()

    step_id2 = step_instance2.id
    await _check_escalations_async()

    res_step2 = await db.execute(select(ApprovalInstanceStep).where(ApprovalInstanceStep.id == step_id2))
    reloaded_step2 = res_step2.scalar_one()
    assert reloaded_step2.status == "ESCALATED"

    # 3. Test reminder async logging/run
    await _send_reminders_async()
    db.commit = original_commit
