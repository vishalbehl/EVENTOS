from __future__ import annotations

import uuid
from typing import List, Optional
from fastapi import APIRouter, Query, HTTPException, status, Depends, Header

from app.dependencies import DB, ActiveUser
from app.modules.workflow.application.commands import WorkflowCommandService
from app.modules.workflow.application.queries import WorkflowQueryService
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
    db: DB,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key", min_length=8, max_length=255),
) -> WorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization to create workflows."
        )
        
    result = await WorkflowCommandService.create(
        db, org_id, current_user.id, body, idempotency_key=idempotency_key
    )
    return WorkflowOut.model_validate(result)

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
        
    workflows = await WorkflowQueryService.list_workflows(db, org_id)
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
        
    workflow = await WorkflowQueryService.get_workflow(db, org_id, workflow_id)
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
    entity_id: Optional[uuid.UUID] = Query(None, description="Optional entity ID triggering the workflow"),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key", min_length=8, max_length=255),
) -> WorkflowInstanceOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workflow not found.")
        
    result = await WorkflowCommandService.trigger(
        db, org_id, current_user.id, workflow_id, entity_id, idempotency_key=idempotency_key
    )
    return WorkflowInstanceOut.model_validate(result)

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
        
    instance = await WorkflowQueryService.get_instance(db, org_id, instance_id)
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
    db: DB,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key", min_length=8, max_length=255),
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found.")
        
    return await WorkflowCommandService.complete_task(
        db, org_id, current_user.id, task_id, body, idempotency_key=idempotency_key
    )
