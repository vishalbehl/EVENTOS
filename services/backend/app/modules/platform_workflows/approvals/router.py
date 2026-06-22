import uuid
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.dependencies import get_db, require_active_user
from app.modules.identity.models.user import User
from app.modules.platform_workflows.instances.schemas import (
    StartApprovalRequest,
    ApproveRequest,
    RejectRequest,
    ReturnRequest,
    EscalateRequest,
    ApprovalInstanceOut,
    ApprovalInstanceStepOut,
    ApprovalDelegationCreate,
    ApprovalDelegationOut,
    ApprovalEscalationOut,
    ApprovalHistoryOut
)
from app.modules.platform_workflows.instances.models import (
    ApprovalInstance,
    ApprovalInstanceStep,
    ApprovalAttachment
)
from app.modules.platform_workflows.delegations.models import ApprovalDelegation
from app.modules.platform_workflows.escalations.models import ApprovalEscalation
from app.modules.platform_workflows.history.models import ApprovalHistory
from app.modules.platform_workflows.approvals.service import ApprovalService
from app.modules.platform_workflows.delegations.service import DelegationService

router = APIRouter(prefix="/platform/approvals", tags=["platform-approvals"])

# ── Approvals Endpoints ──────────────────────────────────────────

@router.post(
    "/start",
    response_model=ApprovalInstanceOut,
    status_code=status.HTTP_201_CREATED,
    summary="Start an approval workflow instance"
)
async def start_approval(
    body: StartApprovalRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> ApprovalInstanceOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User must belong to an organization."
        )

    instance = await ApprovalService.start_approval(
        db=db,
        org_id=org_id,
        workflow_id=body.workflow_id,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        started_by=current_user.id,
        entity_data=body.entity_data
    )

    if not instance:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not start approval workflow. No matching active workflow found."
        )

    await db.commit()

    # Load and return fully populated instance
    stmt = select(ApprovalInstance).where(
        ApprovalInstance.id == instance.id
    ).options(
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.comments_list),
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.escalations),
        selectinload(ApprovalInstance.attachments),
        selectinload(ApprovalInstance.history)
    )
    res = await db.execute(stmt)
    full_inst = res.scalar_one_or_none()
    return ApprovalInstanceOut.model_validate(full_inst)

@router.post(
    "/{step_instance_id}/approve",
    summary="Approve a pending workflow step"
)
async def approve_step(
    step_instance_id: uuid.UUID,
    body: ApproveRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify step exists and is assigned to the current user (directly or via delegation/role)
    # Note: Delegation check is built into the assignment logic when assigning, but here we can check assigned_to.
    stmt = select(ApprovalInstanceStep).where(
        ApprovalInstanceStep.id == step_instance_id
    )
    res = await db.execute(stmt)
    step = res.scalar_one_or_none()
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow step instance not found."
        )

    # Allow if user is assigned_to, or is a platform admin (override capability)
    is_authorized = (
        step.assigned_to == current_user.id or
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"])
    )
    if not is_authorized:
        # Check active delegate
        stmt_del = select(ApprovalDelegation).where(
            and_(
                ApprovalDelegation.from_user_id == step.assigned_to,
                ApprovalDelegation.to_user_id == current_user.id,
                ApprovalDelegation.is_active == True,
                ApprovalDelegation.start_date <= datetime.utcnow(),
                ApprovalDelegation.end_date >= datetime.utcnow()
            )
        )
        del_res = await db.execute(stmt_del)
        if not del_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to approve this step."
            )

    success = await ApprovalService.approve(db, step_instance_id, current_user.id, body.comments)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step approval failed. Step may not be pending."
        )
    await db.commit()
    return {"status": "success", "message": "Step approved successfully."}

@router.post(
    "/{step_instance_id}/reject",
    summary="Reject a pending workflow step"
)
async def reject_step(
    step_instance_id: uuid.UUID,
    body: RejectRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ApprovalInstanceStep).where(ApprovalInstanceStep.id == step_instance_id)
    res = await db.execute(stmt)
    step = res.scalar_one_or_none()
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow step instance not found."
        )

    is_authorized = (
        step.assigned_to == current_user.id or
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"])
    )
    if not is_authorized:
        stmt_del = select(ApprovalDelegation).where(
            and_(
                ApprovalDelegation.from_user_id == step.assigned_to,
                ApprovalDelegation.to_user_id == current_user.id,
                ApprovalDelegation.is_active == True,
                ApprovalDelegation.start_date <= datetime.utcnow(),
                ApprovalDelegation.end_date >= datetime.utcnow()
            )
        )
        del_res = await db.execute(stmt_del)
        if not del_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to reject this step."
            )

    success = await ApprovalService.reject(db, step_instance_id, current_user.id, body.comments)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step rejection failed. Step may not be pending."
        )
    await db.commit()
    return {"status": "success", "message": "Step rejected successfully."}

@router.post(
    "/{step_instance_id}/return",
    summary="Return a workflow step to the previous level"
)
async def return_step(
    step_instance_id: uuid.UUID,
    body: ReturnRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(ApprovalInstanceStep).where(ApprovalInstanceStep.id == step_instance_id)
    res = await db.execute(stmt)
    step = res.scalar_one_or_none()
    if not step:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workflow step instance not found."
        )

    is_authorized = (
        step.assigned_to == current_user.id or
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"])
    )
    if not is_authorized:
        stmt_del = select(ApprovalDelegation).where(
            and_(
                ApprovalDelegation.from_user_id == step.assigned_to,
                ApprovalDelegation.to_user_id == current_user.id,
                ApprovalDelegation.is_active == True,
                ApprovalDelegation.start_date <= datetime.utcnow(),
                ApprovalDelegation.end_date >= datetime.utcnow()
            )
        )
        del_res = await db.execute(stmt_del)
        if not del_res.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not authorized to return this step."
            )

    success = await ApprovalService.return_step(db, step_instance_id, current_user.id, body.comments)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step return failed. Step may not be pending."
        )
    await db.commit()
    return {"status": "success", "message": "Step returned successfully."}

@router.post(
    "/instances/{instance_id}/cancel",
    summary="Cancel an active workflow instance"
)
async def cancel_approval(
    instance_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    # Verify instance belongs to user organization and either user is requester or platform admin
    instance = await db.get(ApprovalInstance, instance_id)
    if not instance or instance.organization_id != current_user.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Approval instance not found."
        )

    is_authorized = (
        instance.started_by == current_user.id or
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"])
    )
    if not is_authorized:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not authorized to cancel this approval."
        )

    success = await ApprovalService.cancel(db, instance_id, current_user.id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Instance cancellation failed. Instance may not be active."
        )
    await db.commit()
    return {"status": "success", "message": "Approval workflow cancelled successfully."}

@router.post(
    "/{step_instance_id}/escalate",
    summary="Escalate a pending workflow step"
)
async def escalate_step(
    step_instance_id: uuid.UUID,
    body: EscalateRequest,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    success = await ApprovalService.escalate(db, step_instance_id, body.reason, body.escalated_to)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Step escalation failed. Step may not be pending."
        )
    await db.commit()
    return {"status": "success", "message": "Step escalated successfully."}

# ── Instances & Dashboards Endpoints ───────────────────────────────

@router.get(
    "/instances",
    response_model=List[ApprovalInstanceOut],
    summary="List all workflow approval execution instances"
)
async def list_instances(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> List[ApprovalInstanceOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []

    stmt = select(ApprovalInstance).where(
        ApprovalInstance.organization_id == org_id
    ).options(
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.comments_list),
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.escalations),
        selectinload(ApprovalInstance.attachments),
        selectinload(ApprovalInstance.history)
    ).order_by(ApprovalInstance.started_at.desc())

    res = await db.execute(stmt)
    return [ApprovalInstanceOut.model_validate(i) for i in res.scalars().all()]

@router.get(
    "/instances/{instance_id}",
    response_model=ApprovalInstanceOut,
    summary="Get workflow instance details"
)
async def get_instance(
    instance_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> ApprovalInstanceOut:
    org_id = current_user.organization_id
    if not org_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instance not found.")

    stmt = select(ApprovalInstance).where(
        and_(
            ApprovalInstance.id == instance_id,
            ApprovalInstance.organization_id == org_id
        )
    ).options(
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.comments_list),
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.escalations),
        selectinload(ApprovalInstance.attachments),
        selectinload(ApprovalInstance.history)
    )

    res = await db.execute(stmt)
    inst = res.scalar_one_or_none()
    if not inst:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Instance not found.")

    return ApprovalInstanceOut.model_validate(inst)

@router.get(
    "/inbox",
    response_model=List[ApprovalInstanceStepOut],
    summary="Get pending workflow approval tasks assigned to the current user"
)
async def get_inbox(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> List[ApprovalInstanceStepOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []

    # Get active delegations to current user
    del_stmt = select(ApprovalDelegation.from_user_id).where(
        and_(
            ApprovalDelegation.to_user_id == current_user.id,
            ApprovalDelegation.is_active == True,
            ApprovalDelegation.start_date <= datetime.utcnow(),
            ApprovalDelegation.end_date >= datetime.utcnow()
        )
    )
    del_res = await db.execute(del_stmt)
    delegator_ids = list(del_res.scalars().all())

    # Users assigned to current_user.id OR delegated users
    assigned_ids = [current_user.id] + delegator_ids

    # Select pending steps
    stmt = select(ApprovalInstanceStep).join(ApprovalInstance).where(
        and_(
            ApprovalInstance.organization_id == org_id,
            ApprovalInstanceStep.status == "PENDING",
            ApprovalInstanceStep.assigned_to.in_(assigned_ids)
        )
    ).options(
        selectinload(ApprovalInstanceStep.comments_list),
        selectinload(ApprovalInstanceStep.escalations)
    ).order_by(ApprovalInstanceStep.due_at.asc())

    res = await db.execute(stmt)
    return [ApprovalInstanceStepOut.model_validate(s) for s in res.scalars().all()]

@router.get(
    "/my-requests",
    response_model=List[ApprovalInstanceOut],
    summary="Get workflow instances submitted by the current user"
)
async def get_my_requests(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> List[ApprovalInstanceOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []

    stmt = select(ApprovalInstance).where(
        and_(
            ApprovalInstance.organization_id == org_id,
            ApprovalInstance.started_by == current_user.id
        )
    ).options(
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.comments_list),
        selectinload(ApprovalInstance.steps).selectinload(ApprovalInstanceStep.escalations),
        selectinload(ApprovalInstance.attachments),
        selectinload(ApprovalInstance.history)
    ).order_by(ApprovalInstance.started_at.desc())

    res = await db.execute(stmt)
    return [ApprovalInstanceOut.model_validate(i) for i in res.scalars().all()]

# ── Delegations Endpoints ──────────────────────────────────────────

@router.get(
    "/delegations",
    response_model=List[ApprovalDelegationOut],
    summary="List delegations managed/assigned by the current user"
)
async def list_delegations(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> List[ApprovalDelegationOut]:
    # Allow platform admins to see all, normal users to see their own from/to
    is_admin = (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"]) or current_user.role == "super_admin"

    if is_admin:
        stmt = select(ApprovalDelegation).order_by(ApprovalDelegation.start_date.desc())
    else:
        stmt = select(ApprovalDelegation).where(
            or_(
                ApprovalDelegation.from_user_id == current_user.id,
                ApprovalDelegation.to_user_id == current_user.id
            )
        ).order_by(ApprovalDelegation.start_date.desc())

    res = await db.execute(stmt)
    return [ApprovalDelegationOut.model_validate(d) for d in res.scalars().all()]

@router.post(
    "/delegations",
    response_model=ApprovalDelegationOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new approval delegation rule"
)
async def create_delegation(
    body: ApprovalDelegationCreate,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> ApprovalDelegationOut:
    # Delegate to DelegationService
    delegation = await DelegationService.create_delegation(
        db=db,
        from_user_id=current_user.id,
        to_user_id=body.to_user_id,
        start_date=body.start_date,
        end_date=body.end_date
    )
    await db.commit()

    return ApprovalDelegationOut.model_validate(delegation)

@router.delete(
    "/delegations/{delegation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke or deactivate an approval delegation"
)
async def delete_delegation(
    delegation_id: uuid.UUID,
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
):
    delegation = await db.get(ApprovalDelegation, delegation_id)
    if not delegation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Delegation not found.")

    # Only creator or receiver or admin can delete/deactivate
    is_authorized = (
        delegation.from_user_id == current_user.id or
        delegation.to_user_id == current_user.id or
        (current_user.platform_role and current_user.platform_role in ["SUPER_ADMIN", "SUPPORT_ADMIN"])
    )
    if not is_authorized:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized.")

    delegation.is_active = False
    await db.commit()
    return

# ── Audit & Escalations Endpoints ────────────────────────────────────

@router.get(
    "/escalations",
    response_model=List[ApprovalEscalationOut],
    summary="List escalations logs"
)
async def list_escalations(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> List[ApprovalEscalationOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []

    stmt = select(ApprovalEscalation).join(ApprovalInstanceStep).join(ApprovalInstance).where(
        ApprovalInstance.organization_id == org_id
    ).order_by(ApprovalEscalation.escalated_at.desc())

    res = await db.execute(stmt)
    return [ApprovalEscalationOut.model_validate(e) for e in res.scalars().all()]

@router.get(
    "/history",
    response_model=List[ApprovalHistoryOut],
    summary="List immutable workflow audit history logs"
)
async def list_history(
    current_user: User = Depends(require_active_user),
    db: AsyncSession = Depends(get_db)
) -> List[ApprovalHistoryOut]:
    org_id = current_user.organization_id
    if not org_id:
        return []

    stmt = select(ApprovalHistory).join(ApprovalInstance).where(
        ApprovalInstance.organization_id == org_id
    ).order_by(ApprovalHistory.created_at.desc())

    res = await db.execute(stmt)
    return [ApprovalHistoryOut.model_validate(h) for h in res.scalars().all()]
