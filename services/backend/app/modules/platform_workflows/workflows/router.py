import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_db, require_active_user
from app.modules.identity.models.user import User
from app.modules.platform_workflows.workflows.schemas import (
    ApprovalWorkflowCreate,
    ApprovalWorkflowUpdate,
    ApprovalWorkflowOut
)
from app.modules.platform_workflows.workflows.service import WorkflowService

router = APIRouter(prefix="/platform/workflows", tags=["platform-workflows"])

async def require_platform_admin(current_user: User = Depends(require_active_user)):
    is_admin = (
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN", "FINANCE_ADMIN"]) or
        current_user.role == "super_admin" or
        getattr(current_user, "is_platform_admin", False) or
        (current_user.organization and current_user.organization.slug == "eventxos")
    )
    if not is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform Admin access required to manage workflows"
        )
    return current_user

@router.post(
    "",
    response_model=ApprovalWorkflowOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new workflow template"
)
async def create_workflow(
    body: ApprovalWorkflowCreate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
) -> ApprovalWorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization."
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

    data = body.model_dump()
    data["created_by"] = current_user.id
    workflow = await WorkflowService.create_workflow(db, org_id, data)
    await db.commit()

    # Fetch with relations
    updated_wf = await WorkflowService.get_workflow(db, org_id, workflow.id)
    if not updated_wf:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Workflow creation failed."
        )
    return ApprovalWorkflowOut.model_validate(updated_wf)

@router.get(
    "",
    response_model=List[ApprovalWorkflowOut],
    summary="List all workflow templates"
)
async def list_workflows(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> List[ApprovalWorkflowOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []

    workflows = await WorkflowService.list_workflows(db, org_id)
    return [ApprovalWorkflowOut.model_validate(w) for w in workflows]

@router.get(
    "/{workflow_id}",
    response_model=ApprovalWorkflowOut,
    summary="Get workflow details"
)
async def get_workflow(
    workflow_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> ApprovalWorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    workflow = await WorkflowService.get_workflow(db, org_id, workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )
    return ApprovalWorkflowOut.model_validate(workflow)

@router.patch(
    "/{workflow_id}",
    response_model=ApprovalWorkflowOut,
    summary="Update workflow details"
)
async def update_workflow(
    workflow_id: uuid.UUID,
    body: ApprovalWorkflowUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
) -> ApprovalWorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    # Order steps to verify no gaps if they are being updated
    if body.steps is not None:
        sorted_steps = sorted(body.steps, key=lambda s: s.step_order)
        for idx, step in enumerate(sorted_steps):
            expected_order = idx + 1
            if step.step_order != expected_order:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Workflow steps must be sequential starting at 1. Expected step order {expected_order}, got {step.step_order}."
                )

    data = body.model_dump(exclude_unset=True)
    workflow = await WorkflowService.update_workflow(db, org_id, workflow_id, data)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )
    await db.commit()

    updated_wf = await WorkflowService.get_workflow(db, org_id, workflow_id)
    return ApprovalWorkflowOut.model_validate(updated_wf)

@router.delete(
    "/{workflow_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Archive/Delete a workflow template"
)
async def archive_workflow(
    workflow_id: uuid.UUID,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
):
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    success = await WorkflowService.archive_workflow(db, org_id, workflow_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )
    await db.commit()
    return

@router.post(
    "/{workflow_id}/publish",
    response_model=ApprovalWorkflowOut,
    summary="Publish/Activate a workflow template"
)
async def publish_workflow(
    workflow_id: uuid.UUID,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
) -> ApprovalWorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    workflow = await WorkflowService.publish_workflow(db, org_id, workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )
    await db.commit()

    updated_wf = await WorkflowService.get_workflow(db, org_id, workflow_id)
    return ApprovalWorkflowOut.model_validate(updated_wf)

@router.post(
    "/{workflow_id}/clone",
    response_model=ApprovalWorkflowOut,
    status_code=status.HTTP_201_CREATED,
    summary="Clone a workflow template"
)
async def clone_workflow(
    workflow_id: uuid.UUID,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_db)
) -> ApprovalWorkflowOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow not found."
        )

    workflow = await WorkflowService.clone_workflow(db, org_id, workflow_id)
    if not workflow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow source not found."
        )
    await db.commit()

    updated_wf = await WorkflowService.get_workflow(db, org_id, workflow.id)
    return ApprovalWorkflowOut.model_validate(updated_wf)
