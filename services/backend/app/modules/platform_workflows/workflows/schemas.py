import uuid
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

# Conditions
class ApprovalWorkflowConditionCreate(BaseModel):
    field_name: str
    operator: str
    value: str
    logical_operator: Optional[str] = "AND"

class ApprovalWorkflowConditionOut(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    field_name: str
    operator: str
    value: str
    logical_operator: str

    class Config:
        from_attributes = True

# Step Approvers
class ApprovalStepApproverCreate(BaseModel):
    user_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    team_id: Optional[uuid.UUID] = None
    role_id: Optional[uuid.UUID] = None

class ApprovalStepApproverOut(BaseModel):
    id: uuid.UUID
    workflow_step_id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    department_id: Optional[uuid.UUID] = None
    team_id: Optional[uuid.UUID] = None
    role_id: Optional[uuid.UUID] = None

    class Config:
        from_attributes = True

# Workflow Steps
class ApprovalWorkflowStepCreate(BaseModel):
    step_order: int
    name: str
    description: Optional[str] = None
    approval_type: str = "ANYONE"
    assignment_type: str = "ROLE"
    minimum_approvals: int = 1
    allow_rejection: bool = True
    allow_return: bool = True
    allow_skip: bool = False
    escalation_hours: Optional[int] = None
    timeout_hours: Optional[int] = None
    is_final: bool = False
    approvers: List[ApprovalStepApproverCreate] = []

class ApprovalWorkflowStepOut(BaseModel):
    id: uuid.UUID
    workflow_id: uuid.UUID
    step_order: int
    name: str
    description: Optional[str] = None
    approval_type: str
    assignment_type: str
    minimum_approvals: int
    allow_rejection: bool
    allow_return: bool
    allow_skip: bool
    escalation_hours: Optional[int] = None
    timeout_hours: Optional[int] = None
    is_final: bool
    approvers: List[ApprovalStepApproverOut]

    class Config:
        from_attributes = True

# Workflows
class ApprovalWorkflowCreate(BaseModel):
    name: str
    code: str
    description: Optional[str] = None
    module: str
    entity_type: str
    is_system: bool = False
    is_active: bool = True
    trigger_event: str = "create"
    conditions: List[ApprovalWorkflowConditionCreate] = []
    steps: List[ApprovalWorkflowStepCreate]

class ApprovalWorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    version: Optional[int] = None
    trigger_event: Optional[str] = None
    conditions: Optional[List[ApprovalWorkflowConditionCreate]] = None
    steps: Optional[List[ApprovalWorkflowStepCreate]] = None

class ApprovalWorkflowOut(BaseModel):
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    code: str
    description: Optional[str] = None
    module: str
    entity_type: str
    is_system: bool
    is_active: bool
    version: int
    trigger_event: str
    created_at: datetime
    updated_at: datetime
    conditions: List[ApprovalWorkflowConditionOut]
    steps: List[ApprovalWorkflowStepOut]

    class Config:
        from_attributes = True
