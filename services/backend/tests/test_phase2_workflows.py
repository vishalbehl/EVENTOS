import pytest
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workflow.models.workflow import Workflow, WorkflowInstance, WorkflowTask
from app.modules.workflow.services.workflow_service import WorkflowService
from app.modules.workflow.schemas.workflow_schemas import WorkflowCreate, WorkflowStepCreate
from app.modules.workflow.application.commands import WorkflowCommandService
from app.modules.workflow.application.queries import WorkflowQueryService

@pytest.mark.asyncio
async def test_workflow_execution_and_approval(db: AsyncSession, organization, organizer):
    org_id = organization.id
    
    # 1. Create a workflow template
    wf_data = WorkflowCreate(
        name="Auto Notification & Review",
        description="A template testing pipeline step execution",
        steps=[
          WorkflowStepCreate(step_name="Email Notification", step_order=1, config={"to": "user@domain.com"}),
          WorkflowStepCreate(step_name="Manual Review", step_order=2, config={"assignee_id": str(organizer.id)})
        ]
    )
    
    workflow = await WorkflowService.create_workflow(db, org_id, wf_data)
    await db.flush()
    
    assert workflow.name == "Auto Notification & Review"
    assert len(workflow.steps) == 2
    
    # 2. Trigger workflow instance
    instance = await WorkflowService.trigger_workflow(db, org_id, workflow.id, uuid.uuid4())
    await db.flush()
    
    assert instance is not None
    assert instance.status == "running"
    
    # Reload instance with tasks populated
    loaded_inst = await WorkflowService.get_instance(db, org_id, instance.id)
    assert loaded_inst is not None
    
    # Since Step 1 (Email Notification) is automated, it executes and auto-proceeds to Step 2.
    # Therefore, we should have two tasks:
    # Task 1 (Email) status should be completed.
    # Task 2 (Manual Review) status should be pending.
    assert len(loaded_inst.tasks) == 2
    
    email_task = next(t for t in loaded_inst.tasks if t.step.step_name == "Email Notification")
    assert email_task.status == "completed"
    
    manual_task = next(t for t in loaded_inst.tasks if t.step.step_name == "Manual Review")
    assert manual_task.status == "pending"
    assert loaded_inst.status == "running"
    
    # 3. Approve manual task
    success = await WorkflowService.complete_task(db, org_id, manual_task.id, "Approve documents.")
    await db.flush()
    
    assert success is True
    
    # Reload and verify completion
    completed_inst = await WorkflowService.get_instance(db, org_id, instance.id)
    assert completed_inst.status == "completed"
    
    completed_tasks = completed_inst.tasks
    assert all(t.status == "completed" for t in completed_tasks)


@pytest.mark.asyncio
async def test_workflow_commands_are_tenant_scoped_and_idempotent(db: AsyncSession, organization, organizer):
    organization_id = organization.id
    actor_id = organizer.id
    payload = WorkflowCreate(
        name="Replay-safe workflow",
        steps=[WorkflowStepCreate(step_name="Manual Review", step_order=1)],
    )

    first = await WorkflowCommandService.create(
        db,
        organization_id,
        actor_id,
        payload,
        idempotency_key="workflow-create-replay-001",
    )
    replay = await WorkflowCommandService.create(
        db,
        organization_id,
        actor_id,
        payload,
        idempotency_key="workflow-create-replay-001",
    )

    assert first["id"] == replay["id"]
    workflow_id = uuid.UUID(first["id"])
    assert await WorkflowQueryService.get_workflow(db, uuid.uuid4(), workflow_id) is None

    triggered = await WorkflowCommandService.trigger(
        db,
        organization_id,
        actor_id,
        workflow_id,
        None,
        idempotency_key="workflow-trigger-replay-001",
    )
    triggered_replay = await WorkflowCommandService.trigger(
        db,
        organization_id,
        actor_id,
        workflow_id,
        None,
        idempotency_key="workflow-trigger-replay-001",
    )
    assert triggered["id"] == triggered_replay["id"]
