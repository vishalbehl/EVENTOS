import uuid
from typing import List, Optional, Any
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.modules.platform_workflows.workflows.models import ApprovalWorkflow, ApprovalWorkflowStep, ApprovalStepApprover
from app.modules.platform_workflows.conditions.models import ApprovalWorkflowCondition
from app.modules.platform.roles.models import UserAssignment
from app.modules.platform.teams.models import TeamMember
from app.modules.platform.departments.models import DepartmentMember

class WorkflowResolverService:
    @staticmethod
    async def find_matching_workflow(
        db: AsyncSession,
        org_id: uuid.UUID,
        module: str,
        entity_type: str,
        entity_data: dict
    ) -> Optional[ApprovalWorkflow]:
        # Fetch active workflows matching the module and entity_type
        stmt = select(ApprovalWorkflow).where(
            and_(
                ApprovalWorkflow.organization_id == org_id,
                ApprovalWorkflow.module == module,
                ApprovalWorkflow.entity_type == entity_type,
                ApprovalWorkflow.is_active == True
            )
        ).options(
            selectinload(ApprovalWorkflow.conditions),
            selectinload(ApprovalWorkflow.steps).selectinload(ApprovalWorkflowStep.approvers)
        ).order_by(ApprovalWorkflow.version.desc())
        
        result = await db.execute(stmt)
        workflows = result.scalars().all()
        
        # Evaluate conditions for each workflow
        for wf in workflows:
            if not wf.conditions:
                return wf  # default fallback workflow
            
            if WorkflowResolverService.evaluate_conditions(wf.conditions, entity_data):
                return wf
                
        return None

    @staticmethod
    def evaluate_conditions(conditions: List[ApprovalWorkflowCondition], entity_data: dict) -> bool:
        if not conditions:
            return True
            
        result = True
        for idx, cond in enumerate(conditions):
            val = entity_data.get(cond.field_name)
            cond_met = False
            op = cond.operator.upper()
            
            try:
                # Handle numerical comparison
                if op in (">", "GT", "<", "LT", ">=", "LE", "<=", "GE"):
                    numeric_val = float(val)
                    numeric_cond = float(cond.value)
                    if op in (">", "GT"):
                        cond_met = numeric_val > numeric_cond
                    elif op in ("<", "LT"):
                        cond_met = numeric_val < numeric_cond
                    elif op == ">=":
                        cond_met = numeric_val >= numeric_cond
                    elif op in ("<=", "LE"):
                        cond_met = numeric_val <= numeric_cond
                else:
                    str_val = str(val).lower() if val is not None else ""
                    str_cond = str(cond.value).lower()
                    if op in ("=", "==", "EQ"):
                        cond_met = str_val == str_cond
                    elif op in ("!=", "NE"):
                        cond_met = str_val != str_cond
                    elif op in ("CONTAINS", "IN"):
                        cond_met = str_cond in str_val
            except Exception:
                cond_met = False
                
            logical_op = cond.logical_operator.upper() if cond.logical_operator else "AND"
            if idx == 0:
                result = cond_met
            else:
                if logical_op == "OR":
                    result = result or cond_met
                else:
                    result = result and cond_met
                    
        return result

    @staticmethod
    async def resolve_approvers(db: AsyncSession, step: ApprovalWorkflowStep, entity_data: dict) -> List[uuid.UUID]:
        user_ids = []
        
        for appr in step.approvers:
            if step.assignment_type == "USER" and appr.user_id:
                user_ids.append(appr.user_id)
                
            elif step.assignment_type == "ROLE" and appr.role_id:
                # Find users assigned this role in the department
                stmt = select(UserAssignment.user_id).where(UserAssignment.role_id == appr.role_id)
                if appr.department_id:
                    stmt = stmt.where(UserAssignment.department_id == appr.department_id)
                res = await db.execute(stmt)
                user_ids.extend(res.scalars().all())
                
            elif step.assignment_type == "TEAM" and appr.team_id:
                # Find all squad members
                stmt = select(TeamMember.user_id).where(TeamMember.team_id == appr.team_id)
                res = await db.execute(stmt)
                user_ids.extend(res.scalars().all())
                
            elif step.assignment_type == "DEPARTMENT" and appr.department_id:
                # Find all department members
                stmt = select(DepartmentMember.user_id).where(DepartmentMember.department_id == appr.department_id)
                res = await db.execute(stmt)
                user_ids.extend(res.scalars().all())
                
            elif step.assignment_type == "MANAGER":
                # Fallback to general supervisor or department leads
                if appr.department_id:
                    stmt = select(DepartmentMember.user_id).where(DepartmentMember.department_id == appr.department_id)
                    res = await db.execute(stmt)
                    user_ids.extend(res.scalars().all())
                    
            elif step.assignment_type == "DYNAMIC":
                # Resolve from entity details
                target = entity_data.get("assignee_id") or entity_data.get("owner_id")
                if target:
                    try:
                        user_ids.append(uuid.UUID(str(target)))
                    except ValueError:
                        pass
                        
        return list(set(user_ids))  # unique user IDs
