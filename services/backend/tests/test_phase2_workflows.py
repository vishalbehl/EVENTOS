import pytest
import uuid
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.workflow.models.workflow import Workflow, WorkflowInstance, WorkflowTask
from app.modules.workflow.services.workflow_service import WorkflowService
from app.modules.workflow.schemas.workflow_schemas import WorkflowCreate, WorkflowStepCreate

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
