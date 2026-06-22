import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform_workflows.instances.models import ApprovalInstance, ApprovalInstanceStep
from app.modules.platform_workflows.workflows.models import ApprovalWorkflow, ApprovalWorkflowStep
from app.modules.platform_workflows.history.models import ApprovalHistory
from app.modules.platform_workflows.escalations.models import ApprovalEscalation
from app.modules.platform_workflows.workflows.resolver_service import WorkflowResolverService
from app.modules.platform_workflows.delegations.service import DelegationService
from app.modules.platform_workflows.workflows.notification_service import NotificationService

class ApprovalService:
    @staticmethod
    async def start_approval(
        db: AsyncSession,
        org_id: uuid.UUID,
        workflow_id: Optional[uuid.UUID],
        entity_type: str,
        entity_id: uuid.UUID,
        started_by: uuid.UUID,
        entity_data: dict
    ) -> Optional[ApprovalInstance]:
        # 1. Resolve workflow
        workflow = None
        if workflow_id:
            workflow = await db.get(ApprovalWorkflow, workflow_id)
        else:
            workflow = await WorkflowResolverService.find_matching_workflow(
                db, org_id, entity_type.split(".")[0], entity_type, entity_data
            )
            
        if not workflow or not workflow.is_active:
            return None

        # Fetch workflow steps
        stmt = select(ApprovalWorkflowStep).where(
            ApprovalWorkflowStep.workflow_id == workflow.id
        ).order_by(ApprovalWorkflowStep.step_order.asc()).options(
            selectinload(ApprovalWorkflowStep.approvers)
        )
        res = await db.execute(stmt)
        steps = res.scalars().all()
        
        if not steps:
            return None

        first_step = steps[0]

        # 2. Create Instance
        instance = ApprovalInstance(
            id=uuid.uuid4(),
            organization_id=org_id,
            workflow_id=workflow.id,
            entity_type=entity_type,
            entity_id=entity_id,
            status="IN_PROGRESS",
            current_step_id=first_step.id,
            started_by=started_by,
            started_at=datetime.now(timezone.utc)
        )
        db.add(instance)

        # Write history
        history = ApprovalHistory(
            id=uuid.uuid4(),
            instance_id=instance.id,
            event_type="started",
            performed_by=started_by,
            old_status=None,
            new_status="IN_PROGRESS",
            metadata_json={"workflow_name": workflow.name}
        )
        db.add(history)
        await db.flush()

        # 3. Start first step
        await ApprovalService.start_step(db, instance, first_step, entity_data)
        
        return instance

    @staticmethod
    async def start_step(
        db: AsyncSession,
        instance: ApprovalInstance,
        step: ApprovalWorkflowStep,
        entity_data: dict
    ) -> ApprovalInstanceStep:
        # Resolve step approvers
        candidate_ids = await WorkflowResolverService.resolve_approvers(db, step, entity_data)
        
        # Apply delegations
        final_assigned_to = None
        notified_user_ids = []
        
        for uid in candidate_ids:
            delegate_id = await DelegationService.get_active_delegate(db, uid)
            if delegate_id:
                notified_user_ids.append(delegate_id)
                if not final_assigned_to:
                    final_assigned_to = delegate_id
            else:
                notified_user_ids.append(uid)
                if not final_assigned_to:
                    final_assigned_to = uid

        due_date = None
        if step.timeout_hours:
            due_date = datetime.now(timezone.utc) + timedelta(hours=step.timeout_hours)

        inst_step = ApprovalInstanceStep(
            id=uuid.uuid4(),
            instance_id=instance.id,
            workflow_step_id=step.id,
            status="PENDING",
            assigned_to=final_assigned_to,
            due_at=due_date
        )
        db.add(inst_step)

        # Write history
        history = ApprovalHistory(
            id=uuid.uuid4(),
            instance_id=instance.id,
            event_type="step_assigned",
            performed_by=None,
            old_status=None,
            new_status="PENDING",
            metadata_json={"step_name": step.name, "assigned_to": str(final_assigned_to) if final_assigned_to else None}
        )
        db.add(history)
        await db.flush()

        # Notify approvers
        await NotificationService.notify_approvers(db, inst_step.id, notified_user_ids)

        return inst_step

    @staticmethod
    async def approve(
        db: AsyncSession,
        step_instance_id: uuid.UUID,
        user_id: uuid.UUID,
        comments: Optional[str] = None
    ) -> bool:
        stmt = select(ApprovalInstanceStep).where(
            ApprovalInstanceStep.id == step_instance_id
        ).options(
            selectinload(ApprovalInstanceStep.instance).selectinload(ApprovalInstance.workflow),
            selectinload(ApprovalInstanceStep.workflow_step)
        )
        res = await db.execute(stmt)
        step_inst = res.scalar_one_or_none()
        
        if not step_inst or step_inst.status != "PENDING":
            return False

        # Set step status to approved
        step_inst.status = "APPROVED"
        step_inst.approved_by = user_id
        step_inst.approved_at = datetime.now(timezone.utc)
        step_inst.comments = comments

        instance = step_inst.instance
        workflow = instance.workflow

        # Write history
        history = ApprovalHistory(
            id=uuid.uuid4(),
            instance_id=instance.id,
            event_type="step_approved",
            performed_by=user_id,
            old_status="PENDING",
            new_status="APPROVED",
            metadata_json={"step_name": step_inst.workflow_step.name, "comments": comments}
        )
        db.add(history)

        # Get all steps to determine next
        steps_stmt = select(ApprovalWorkflowStep).where(
            ApprovalWorkflowStep.workflow_id == workflow.id
        ).order_by(ApprovalWorkflowStep.step_order.asc())
        steps_res = await db.execute(steps_stmt)
        steps = steps_res.scalars().all()

        current_order = step_inst.workflow_step.step_order
        next_step = next((s for s in steps if s.step_order == current_order + 1), None)

        if next_step and not step_inst.workflow_step.is_final:
            # Proceed to next step
            instance.current_step_id = next_step.id
            await ApprovalService.start_step(db, instance, next_step, {})
        else:
            # Complete the workflow instance
            instance.status = "COMPLETED"
            instance.completed_at = datetime.now(timezone.utc)
            instance.current_step_id = None
            
            comp_hist = ApprovalHistory(
                id=uuid.uuid4(),
                instance_id=instance.id,
                event_type="completed",
                performed_by=user_id,
                old_status="IN_PROGRESS",
                new_status="COMPLETED"
            )
            db.add(comp_hist)
            await NotificationService.notify_requester(db, instance.id, "completed")

        await db.flush()
        return True

    @staticmethod
    async def reject(
        db: AsyncSession,
        step_instance_id: uuid.UUID,
        user_id: uuid.UUID,
        comments: Optional[str] = None
    ) -> bool:
        stmt = select(ApprovalInstanceStep).where(
            ApprovalInstanceStep.id == step_instance_id
        ).options(
            selectinload(ApprovalInstanceStep.instance),
            selectinload(ApprovalInstanceStep.workflow_step)
        )
        res = await db.execute(stmt)
        step_inst = res.scalar_one_or_none()
        
        if not step_inst or step_inst.status != "PENDING":
            return False

        # Set step status to rejected
        step_inst.status = "REJECTED"
        step_inst.rejected_by = user_id
        step_inst.rejected_at = datetime.now(timezone.utc)
        step_inst.comments = comments

        instance = step_inst.instance
        instance.status = "REJECTED"
        instance.completed_at = datetime.now(timezone.utc)
        instance.current_step_id = None

        # Write history
        history = ApprovalHistory(
            id=uuid.uuid4(),
            instance_id=instance.id,
            event_type="step_rejected",
            performed_by=user_id,
            old_status="PENDING",
            new_status="REJECTED",
            metadata_json={"step_name": step_inst.workflow_step.name, "comments": comments}
        )
        db.add(history)
        await db.flush()

        await NotificationService.notify_requester(db, instance.id, "rejected")
        return True

    @staticmethod
    async def return_step(
        db: AsyncSession,
        step_instance_id: uuid.UUID,
        user_id: uuid.UUID,
        comments: Optional[str] = None
    ) -> bool:
        stmt = select(ApprovalInstanceStep).where(
            ApprovalInstanceStep.id == step_instance_id
        ).options(
            selectinload(ApprovalInstanceStep.instance).selectinload(ApprovalInstance.workflow),
            selectinload(ApprovalInstanceStep.workflow_step)
        )
        res = await db.execute(stmt)
        step_inst = res.scalar_one_or_none()
        
        if not step_inst or step_inst.status != "PENDING":
            return False

        step_inst.status = "RETURNED"
        step_inst.returned_by = user_id
        step_inst.returned_at = datetime.now(timezone.utc)
        step_inst.comments = comments

        instance = step_inst.instance
        workflow = instance.workflow

        # Write history
        history = ApprovalHistory(
            id=uuid.uuid4(),
            instance_id=instance.id,
            event_type="step_returned",
            performed_by=user_id,
            old_status="PENDING",
            new_status="RETURNED",
            metadata_json={"step_name": step_inst.workflow_step.name, "comments": comments}
        )
        db.add(history)

        # Get previous step
        steps_stmt = select(ApprovalWorkflowStep).where(
            ApprovalWorkflowStep.workflow_id == workflow.id
        ).order_by(ApprovalWorkflowStep.step_order.asc())
        steps_res = await db.execute(steps_stmt)
        steps = steps_res.scalars().all()

        current_order = step_inst.workflow_step.step_order
        prev_step = next((s for s in reversed(steps) if s.step_order < current_order), None)

        if prev_step:
            instance.current_step_id = prev_step.id
            await ApprovalService.start_step(db, instance, prev_step, {})
        else:
            # No previous step, set instance to RETURNED status
            instance.status = "RETURNED"
            instance.current_step_id = None
            await NotificationService.notify_requester(db, instance.id, "returned")

        await db.flush()
        return True

    @staticmethod
    async def cancel(db: AsyncSession, instance_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        instance = await db.get(ApprovalInstance, instance_id)
        if not instance or instance.status not in ("PENDING", "IN_PROGRESS"):
            return False

        instance.status = "CANCELLED"
        instance.cancelled_at = datetime.now(timezone.utc)
        instance.current_step_id = None

        # Cancel active steps
        stmt = select(ApprovalInstanceStep).where(
            and_(
                ApprovalInstanceStep.instance_id == instance_id,
                ApprovalInstanceStep.status == "PENDING"
            )
        )
        res = await db.execute(stmt)
        active_steps = res.scalars().all()
        for s in active_steps:
            s.status = "CANCELLED"

        # Write history
        history = ApprovalHistory(
            id=uuid.uuid4(),
            instance_id=instance_id,
            event_type="cancelled",
            performed_by=user_id,
            old_status="IN_PROGRESS",
            new_status="CANCELLED"
        )
        db.add(history)
        await db.flush()

        await NotificationService.notify_requester(db, instance.id, "cancelled")
        return True

    @staticmethod
    async def escalate(
        db: AsyncSession,
        step_instance_id: uuid.UUID,
        reason: str,
        escalated_to: uuid.UUID
    ) -> bool:
        step_inst = await db.get(ApprovalInstanceStep, step_instance_id)
        if not step_inst or step_inst.status != "PENDING":
            return False

        # Create escalation log
        escalation = ApprovalEscalation(
            id=uuid.uuid4(),
            instance_step_id=step_instance_id,
            escalated_to=escalated_to,
            escalated_at=datetime.now(timezone.utc),
            reason=reason
        )
        db.add(escalation)

        # Update assignment
        step_inst.status = "ESCALATED"
        step_inst.assigned_to = escalated_to

        # Write history
        stmt = select(ApprovalInstance.id).where(ApprovalInstance.current_step_id == step_inst.workflow_step_id)
        res = await db.execute(stmt)
        inst_id = res.scalar_one_or_none()
        
        if inst_id:
            history = ApprovalHistory(
                id=uuid.uuid4(),
                instance_id=inst_id,
                event_type="escalated",
                performed_by=None,
                old_status="PENDING",
                new_status="ESCALATED",
                metadata_json={"reason": reason, "escalated_to": str(escalated_to)}
            )
            db.add(history)

        await db.flush()
        await NotificationService.notify_escalation(db, step_instance_id, escalated_to)
        return True
