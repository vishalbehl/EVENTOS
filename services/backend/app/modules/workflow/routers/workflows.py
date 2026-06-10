from __future__ import annotations

import uuid
from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException, status, Depends

from app.dependencies import DB, ActiveUser
from app.modules.workflow.services.workflow_service import WorkflowService
from app.modules.workflow.schemas.workflow_schemas import (
    WorkflowOut, WorkflowCreate, WorkflowInstanceOut, CompleteTaskRequest
)

router = APIRouter(prefix="/workflows", tags=["workflows"])

@router.post(
    "",
    response_model=WorkflowOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workflow template"
)
async def create_workflow(
    body: WorkflowCreate,
    current_user: ActiveUser,
    db: DB
) -> WorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization to create workflows."
        )
        
    # Order steps to verify no gaps
    sorted_steps = sorted(body.steps, key=lambda s: s.step_order)
    for idx, step in enumerate(sorted_steps):
        expected_order = idx + 1
        if step.step_order != expected_order:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Workflow steps must be sequential starting at 1. Expected step order {expected_order}, got {step.step_order}."
            )
            
    workflow = await WorkflowService.create_workflow(db, org_id, body)
    await db.commit()
    
    # Reload workflow to populate steps relationship
    updated_wf = await WorkflowService.get_workflow(db, org_id, workflow.id)
    if not updated_wf:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Workflow creation failed.")
        
    return WorkflowOut.model_validate(updated_wf)

@router.get(
    "",
    response_model=List[WorkflowOut],
    summary="List organization workflows"
)
async def list_workflows(
    current_user: ActiveUser,
    db: DB
) -> List[WorkflowOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []
        
    workflows = await WorkflowService.list_workflows(db, org_id)
    return [WorkflowOut.model_validate(w) for w in workflows]

@router.get(
    "/{workflow_id}",
    response_model=WorkflowOut,
    summary="Get workflow details"
)
async def get_workflow(
    workflow_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB
) -> WorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
        
    workflow = await WorkflowService.get_workflow(db, org_id, workflow_id)
    if not workflow:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
        
    return WorkflowOut.model_validate(workflow)

@router.post(
    "/{workflow_id}/trigger",
    response_model=WorkflowInstanceOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Trigger/Execute a workflow template"
)
async def trigger_workflow(
    workflow_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB,
    entity_id: Optional[uuid.UUID] = Query(None, description="Optional entity ID triggering the workflow")
) -> WorkflowInstanceOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
        
    instance = await WorkflowService.trigger_workflow(db, org_id, workflow_id, entity_id)
    if not instance:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Could not trigger workflow. Verify it is active.")
        
    await db.commit()
    
    # Reload instance with relations
    updated_inst = await WorkflowService.get_instance(db, org_id, instance.id)
    if not updated_inst:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Workflow execution failed.")
        
    return WorkflowInstanceOut.model_validate(updated_inst)

@router.get(
    "/instances/{instance_id}",
    response_model=WorkflowInstanceOut,
    summary="Get workflow instance status and history"
)
async def get_instance_status(
    instance_id: uuid.UUID,
    current_user: ActiveUser,
    db: DB
) -> WorkflowInstanceOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow instance not found.")
        
    instance = await WorkflowService.get_instance(db, org_id, instance_id)
    if not instance:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow instance not found.")
        
    return WorkflowInstanceOut.model_validate(instance)

@router.post(
    "/tasks/{task_id}/complete",
    summary="Approve/Complete a pending manual workflow task"
)
async def complete_task(
    task_id: uuid.UUID,
    body: CompleteTaskRequest,
    current_user: ActiveUser,
    db: DB
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
        
    success = await WorkflowService.complete_task(db, org_id, task_id, body.comment)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not complete task. Task may not be pending manual review, or you do not have permission."
        )
        
    await db.commit()
    return {"status": "success", "message": "Manual task completed."}
