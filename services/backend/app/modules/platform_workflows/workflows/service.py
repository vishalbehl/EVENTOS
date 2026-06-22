import uuid
from datetime import datetime, timezone
from typing import List, Optional
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform_workflows.workflows.models import ApprovalWorkflow, ApprovalWorkflowStep, ApprovalStepApprover
from app.modules.platform_workflows.conditions.models import ApprovalWorkflowCondition

class WorkflowService:
    @staticmethod
    async def create_workflow(db: AsyncSession, org_id: uuid.UUID, data: dict) -> ApprovalWorkflow:
        wf_id = uuid.uuid4()
        workflow = ApprovalWorkflow(
            id=wf_id,
            organization_id=org_id,
            name=data["name"],
            code=data["code"].upper(),
            description=data.get("description"),
            module=data["module"],
            entity_type=data["entity_type"],
            is_system=data.get("is_system", False),
            is_active=data.get("is_active", True),
            version=data.get("version", 1),
            trigger_event=data.get("trigger_event", "create"),
            created_by=data.get("created_by")
        )
        db.add(workflow)

        # Create conditions
        workflow.conditions = []
        for cond_data in data.get("conditions", []):
            cond = ApprovalWorkflowCondition(
                id=uuid.uuid4(),
                workflow_id=wf_id,
                field_name=cond_data["field_name"],
                operator=cond_data["operator"],
                value=str(cond_data["value"]),
                logical_operator=cond_data.get("logical_operator", "AND")
            )
            db.add(cond)
            workflow.conditions.append(cond)

        # Create steps
        workflow.steps = []
        for step_data in data.get("steps", []):
            step_id = uuid.uuid4()
            step = ApprovalWorkflowStep(
                id=step_id,
                workflow_id=wf_id,
                step_order=step_data["step_order"],
                name=step_data["name"],
                description=step_data.get("description"),
                approval_type=step_data.get("approval_type", "ANYONE"),
                assignment_type=step_data.get("assignment_type", "ROLE"),
                minimum_approvals=step_data.get("minimum_approvals", 1),
                allow_rejection=step_data.get("allow_rejection", True),
                allow_return=step_data.get("allow_return", True),
                allow_skip=step_data.get("allow_skip", False),
                escalation_hours=step_data.get("escalation_hours"),
                timeout_hours=step_data.get("timeout_hours"),
                is_final=step_data.get("is_final", False)
            )
            db.add(step)

            # Create step approvers
            step.approvers = []
            for app_data in step_data.get("approvers", []):
                appr = ApprovalStepApprover(
                    id=uuid.uuid4(),
                    workflow_step_id=step_id,
                    user_id=app_data.get("user_id"),
                    department_id=app_data.get("department_id"),
                    team_id=app_data.get("team_id"),
                    role_id=app_data.get("role_id")
                )
                db.add(appr)
                step.approvers.append(appr)

            workflow.steps.append(step)

        await db.flush()
        return workflow

    @staticmethod
    async def get_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID) -> Optional[ApprovalWorkflow]:
        stmt = select(ApprovalWorkflow).where(
            and_(
                ApprovalWorkflow.organization_id == org_id,
                ApprovalWorkflow.id == workflow_id
            )
        ).options(
            selectinload(ApprovalWorkflow.conditions),
            selectinload(ApprovalWorkflow.steps).selectinload(ApprovalWorkflowStep.approvers)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_workflows(db: AsyncSession, org_id: uuid.UUID) -> List[ApprovalWorkflow]:
        stmt = select(ApprovalWorkflow).where(
            and_(
                ApprovalWorkflow.organization_id == org_id,
                ApprovalWorkflow.deleted_at == None
            )
        ).options(
            selectinload(ApprovalWorkflow.conditions),
            selectinload(ApprovalWorkflow.steps).selectinload(ApprovalWorkflowStep.approvers)
        ).order_by(ApprovalWorkflow.created_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def update_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID, data: dict) -> Optional[ApprovalWorkflow]:
        workflow = await WorkflowService.get_workflow(db, org_id, workflow_id)
        if not workflow:
            return None

        # Update metadata
        if "name" in data:
            workflow.name = data["name"]
        if "description" in data:
            workflow.description = data["description"]
        if "is_active" in data:
            workflow.is_active = data["is_active"]
        if "version" in data:
            workflow.version = data["version"]
        if "trigger_event" in data:
            workflow.trigger_event = data["trigger_event"]
            
        workflow.updated_at = datetime.now(timezone.utc)

        # Overwrite conditions if provided
        if "conditions" in data:
            # Delete old conditions
            for cond in workflow.conditions:
                await db.delete(cond)
            workflow.conditions = []
            # Add new conditions
            for cond_data in data["conditions"]:
                cond = ApprovalWorkflowCondition(
                    id=uuid.uuid4(),
                    workflow_id=workflow_id,
                    field_name=cond_data["field_name"],
                    operator=cond_data["operator"],
                    value=str(cond_data["value"]),
                    logical_operator=cond_data.get("logical_operator", "AND")
                )
                db.add(cond)
                workflow.conditions.append(cond)

        # Overwrite steps if provided
        if "steps" in data:
            # Delete old steps (cascades to step approvers)
            for step in workflow.steps:
                await db.delete(step)
            workflow.steps = []
            # Add new steps
            for step_data in data["steps"]:
                step_id = uuid.uuid4()
                step = ApprovalWorkflowStep(
                    id=step_id,
                    workflow_id=workflow_id,
                    step_order=step_data["step_order"],
                    name=step_data["name"],
                    description=step_data.get("description"),
                    approval_type=step_data.get("approval_type", "ANYONE"),
                    assignment_type=step_data.get("assignment_type", "ROLE"),
                    minimum_approvals=step_data.get("minimum_approvals", 1),
                    allow_rejection=step_data.get("allow_rejection", True),
                    allow_return=step_data.get("allow_return", True),
                    allow_skip=step_data.get("allow_skip", False),
                    escalation_hours=step_data.get("escalation_hours"),
                    timeout_hours=step_data.get("timeout_hours"),
                    is_final=step_data.get("is_final", False)
                )
                db.add(step)

                step.approvers = []
                for app_data in step_data.get("approvers", []):
                    appr = ApprovalStepApprover(
                        id=uuid.uuid4(),
                        workflow_step_id=step_id,
                        user_id=app_data.get("user_id"),
                        department_id=app_data.get("department_id"),
                        team_id=app_data.get("team_id"),
                        role_id=app_data.get("role_id")
                    )
                    db.add(appr)
                    step.approvers.append(appr)

                workflow.steps.append(step)

        await db.flush()
        return workflow

    @staticmethod
    async def publish_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID) -> Optional[ApprovalWorkflow]:
        workflow = await WorkflowService.get_workflow(db, org_id, workflow_id)
        if not workflow:
            return None
        workflow.is_active = True
        workflow.updated_at = datetime.now(timezone.utc)
        await db.flush()
        return workflow

    @staticmethod
    async def archive_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID) -> bool:
        workflow = await WorkflowService.get_workflow(db, org_id, workflow_id)
        if not workflow:
            return False
        workflow.is_active = False
        workflow.deleted_at = datetime.now(timezone.utc)
        await db.flush()
        return True

    @staticmethod
    async def clone_workflow(db: AsyncSession, org_id: uuid.UUID, workflow_id: uuid.UUID) -> Optional[ApprovalWorkflow]:
        source = await WorkflowService.get_workflow(db, org_id, workflow_id)
        if not source:
            return None

        # Build clone dict
        clone_data = {
            "name": f"{source.name} (Clone)",
            "code": f"{source.code}_CLONE",
            "description": source.description,
            "module": source.module,
            "entity_type": source.entity_type,
            "trigger_event": source.trigger_event,
            "is_system": False,
            "is_active": True,
            "version": 1,
            "conditions": [
                {
                    "field_name": c.field_name,
                    "operator": c.operator,
                    "value": c.value,
                    "logical_operator": c.logical_operator
                } for c in source.conditions
            ],
            "steps": [
                {
                    "step_order": s.step_order,
                    "name": s.name,
                    "description": s.description,
                    "approval_type": s.approval_type,
                    "assignment_type": s.assignment_type,
                    "minimum_approvals": s.minimum_approvals,
                    "allow_rejection": s.allow_rejection,
                    "allow_return": s.allow_return,
                    "allow_skip": s.allow_skip,
                    "escalation_hours": s.escalation_hours,
                    "timeout_hours": s.timeout_hours,
                    "is_final": s.is_final,
                    "approvers": [
                        {
                            "user_id": a.user_id,
                            "department_id": a.department_id,
                            "team_id": a.team_id,
                            "role_id": a.role_id
                        } for a in s.approvers
                    ]
                } for s in source.steps
            ]
        }

        return await WorkflowService.create_workflow(db, org_id, clone_data)
