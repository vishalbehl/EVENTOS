import uuid
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from sqlalchemy import select, delete, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from fastapi import HTTPException

from app.modules.workflow.models.workflow import (
    Workflow, WorkflowStep, WorkflowInstance, WorkflowTask, WorkflowAssignment, WorkflowHistory
)
from app.modules.workflow.schemas.workflow_schemas import WorkflowCreate

class WorkflowService:
    @staticmethod
    async def list_workflows(db: AsyncSession, org_id: uuid.UUID) -> List[Workflow]:
        stmt = select(Workflow).where(Workflow.organization_id == org_id).options(
            selectinload(Workflow.steps)
        ).order_by(Workflow.created_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID) -> Optional[Workflow]:
        stmt = select(Workflow).where(
            Workflow.organization_id == org_id,
            Workflow.id == workflow_id
        ).options(
            selectinload(Workflow.steps)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def create_workflow(db: AsyncSession, org_id: uuid.UUID, data: WorkflowCreate) -> Workflow:
        await WorkflowService.validate_assignees(db, org_id, data.steps)
        workflow = Workflow(
            id=uuid.uuid4(),
            organization_id=org_id,
            name=data.name,
            description=data.description,
            is_active=True,
            created_at=datetime.now(timezone.utc)
        )
        db.add(workflow)
        
        workflow.steps = []
        for idx, s in enumerate(data.steps):
            step = WorkflowStep(
                id=uuid.uuid4(),
                workflow_id=workflow.id,
                step_name=s.step_name,
                step_order=s.step_order,
                config=s.config
            )
            db.add(step)
            workflow.steps.append(step)
            
        await db.flush()
        return workflow

    @staticmethod
    async def validate_assignees(db, org_id, steps):
        from app.modules.rbac.models.organization_member import OrganizationMember
        from app.modules.identity.models.user import User
        assignees = set()
        for step in steps:
            value = (step.config or {}).get("assignee_id")
            if value is not None:
                try:
                    assignees.add(uuid.UUID(str(value)))
                except (ValueError, TypeError, AttributeError):
                    raise HTTPException(422, detail={"code": "INVALID_WORKFLOW_ASSIGNEE"})
        if not assignees:
            return
        accepted = set((await db.scalars(select(OrganizationMember.user_id).join(
            User, User.id == OrganizationMember.user_id).where(
            OrganizationMember.organization_id == org_id,
            OrganizationMember.user_id.in_(assignees), OrganizationMember.is_active.is_(True),
            OrganizationMember.accepted_at.is_not(None), User.is_active.is_(True),
            User.deleted_at.is_(None)))).all())
        if accepted != assignees:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})

    @staticmethod
    async def get_instance(db: AsyncSession, org_id: uuid.UUID, instance_id: uuid.UUID) -> Optional[WorkflowInstance]:
        stmt = select(WorkflowInstance).where(
            WorkflowInstance.organization_id == org_id,
            WorkflowInstance.id == instance_id
        ).options(
            selectinload(WorkflowInstance.workflow).selectinload(Workflow.steps),
            selectinload(WorkflowInstance.history),
            selectinload(WorkflowInstance.tasks).selectinload(WorkflowTask.step),
            selectinload(WorkflowInstance.tasks).selectinload(WorkflowTask.assignments)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def trigger_workflow(
        db: AsyncSession,
        org_id: uuid.UUID,
        workflow_id: uuid.UUID,
        trigger_entity_id: Optional[uuid.UUID] = None
    ) -> Optional[WorkflowInstance]:
        workflow = await WorkflowService.get_workflow(db, org_id, workflow_id)
        if not workflow or not workflow.is_active:
            return None
        await WorkflowService.validate_assignees(db, org_id, workflow.steps)
            
        instance = WorkflowInstance(
            id=uuid.uuid4(),
            workflow_id=workflow_id,
            organization_id=org_id,
            status="running",
            created_at=datetime.now(timezone.utc)
        )
        db.add(instance)
        
        history = WorkflowHistory(
            id=uuid.uuid4(),
            instance_id=instance.id,
            action="started",
            comment=f"Workflow triggered by entity: {trigger_entity_id or 'Manual'}",
            created_at=datetime.now(timezone.utc)
        )
        db.add(history)
        
        await db.flush()
        
        # Execute the first step
        if workflow.steps:
            await WorkflowService.execute_step(db, instance.id, workflow.steps[0].id)
            
        return instance

    @staticmethod
    async def execute_step(db: AsyncSession, instance_id: uuid.UUID, step_id: uuid.UUID):
        # Fetch instance and step
        instance_stmt = select(WorkflowInstance).where(WorkflowInstance.id == instance_id).options(
            selectinload(WorkflowInstance.workflow).selectinload(Workflow.steps)
        )
        instance_res = await db.execute(instance_stmt)
        instance = instance_res.scalar_one_or_none()
        
        if instance is None:
            return
        step_stmt = select(WorkflowStep).where(WorkflowStep.id == step_id,
                                              WorkflowStep.workflow_id == instance.workflow_id)
        step_res = await db.execute(step_stmt)
        step = step_res.scalar_one_or_none()
        
        if not instance or not step:
            return
            
        # Create a WorkflowTask for this step
        task = WorkflowTask(
            id=uuid.uuid4(),
            instance_id=instance_id,
            step_id=step_id,
            status="running",
            created_at=datetime.now(timezone.utc)
        )
        db.add(task)
        await db.flush()
        
        step_name = step.step_name.lower().replace(" ", "_")
        config = step.config or {}
        
        # Branch on step configurations
        if step_name == "email_notification":
            # Simulate sending email notification
            comment = f"Sent email to {config.get('to', 'default@example.com')} using template {config.get('template', 'default')}"
            task.status = "completed"
            
            history = WorkflowHistory(
                id=uuid.uuid4(),
                instance_id=instance_id,
                action="email_sent",
                comment=comment,
                created_at=datetime.now(timezone.utc)
            )
            db.add(history)
            await db.flush()
            
            # Run next step
            await WorkflowService.proceed_next(db, instance, step.step_order)
            
        elif step_name == "badge_approval":
            # Simulate badge approval
            comment = "Badge auto-approved by workflow system."
            task.status = "completed"
            
            history = WorkflowHistory(
                id=uuid.uuid4(),
                instance_id=instance_id,
                action="badge_approved",
                comment=comment,
                created_at=datetime.now(timezone.utc)
            )
            db.add(history)
            await db.flush()
            
            # Run next step
            await WorkflowService.proceed_next(db, instance, step.step_order)
            
        elif step_name == "manual_review":
            # Manual step blocks, waiting for user completion
            task.status = "pending"
            
            # Assign to a user if configured
            assignee = config.get("assignee_id")
            if assignee:
                assignment = WorkflowAssignment(
                    id=uuid.uuid4(),
                    task_id=task.id,
                    assigned_to=uuid.UUID(assignee),
                    assigned_at=datetime.now(timezone.utc)
                )
                db.add(assignment)
                
            history = WorkflowHistory(
                id=uuid.uuid4(),
                instance_id=instance_id,
                action="pending_manual_review",
                comment=f"Step '{step.step_name}' requires manual review.",
                created_at=datetime.now(timezone.utc)
            )
            db.add(history)
            await db.flush()
            
        else:
            # Fallback for unknown step names: auto-complete
            task.status = "completed"
            history = WorkflowHistory(
                id=uuid.uuid4(),
                instance_id=instance_id,
                action="step_auto_passed",
                comment=f"Step '{step.step_name}' auto-passed.",
                created_at=datetime.now(timezone.utc)
            )
            db.add(history)
            await db.flush()
            
            await WorkflowService.proceed_next(db, instance, step.step_order)

    @staticmethod
    async def proceed_next(db: AsyncSession, instance: WorkflowInstance, current_order: int):
        steps = instance.workflow.steps
        next_step = next((s for s in steps if s.step_order == current_order + 1), None)
        
        if next_step:
            await WorkflowService.execute_step(db, instance.id, next_step.id)
        else:
            # All steps completed
            instance.status = "completed"
            history = WorkflowHistory(
                id=uuid.uuid4(),
                instance_id=instance.id,
                action="completed",
                comment="All workflow steps completed successfully.",
                created_at=datetime.now(timezone.utc)
            )
            db.add(history)
            await db.flush()

    @staticmethod
    async def complete_task(db: AsyncSession, org_id: uuid.UUID, task_id: uuid.UUID, comment: Optional[str] = None,
                            *, expected_version: int | None = None) -> bool:
        # Serialize the instance before its task: sibling approvals cannot race
        # advancement. Ownership is filtered in SQL before acquiring any lock.
        instance_id = await db.scalar(select(WorkflowTask.instance_id).join(WorkflowInstance,
            WorkflowInstance.id == WorkflowTask.instance_id).where(
            WorkflowTask.id == task_id, WorkflowInstance.organization_id == org_id))
        if instance_id is None:
            raise HTTPException(404, detail={"code": "RESOURCE_NOT_FOUND"})
        await db.scalar(select(WorkflowInstance).where(WorkflowInstance.id == instance_id,
            WorkflowInstance.organization_id == org_id).with_for_update())
        stmt = select(WorkflowTask).where(WorkflowTask.id == task_id,
            WorkflowTask.instance_id == instance_id).with_for_update().execution_options(populate_existing=True).options(
            selectinload(WorkflowTask.instance).selectinload(WorkflowInstance.workflow).selectinload(Workflow.steps),
            selectinload(WorkflowTask.step)
        )
        res = await db.execute(stmt)
        task = res.scalar_one_or_none()

        if task is not None and expected_version is not None and task.version != expected_version:
            raise HTTPException(412, detail={"code": "VERSION_CONFLICT"})
        
        if not task or task.status != "pending":
            return False
            
        if task.instance.organization_id != org_id:
            return False
            
        task.status = "completed"
        task.version += 1
        
        history = WorkflowHistory(
            id=uuid.uuid4(),
            instance_id=task.instance_id,
            action="manual_approved",
            comment=comment or f"Manual step '{task.step.step_name}' approved.",
            created_at=datetime.now(timezone.utc)
        )
        db.add(history)
        await db.flush()
        
        # Proceed to the next step
        await WorkflowService.proceed_next(db, task.instance, task.step.step_order)
        return True
