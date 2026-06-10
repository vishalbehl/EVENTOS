import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class WorkflowStepCreate(BaseModel):
    step_name: str = Field(min_length=1, max_length=100)
    step_order: int = Field(ge=1)
    config: Dict[str, Any] = Field(default_factory=dict)

class WorkflowStepOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workflow_id: uuid.UUID
    step_name: str
    step_order: int
    config: Dict[str, Any]

class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    steps: List[WorkflowStepCreate] = Field(min_length=1)

class WorkflowOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    name: str
    description: Optional[str] = None
    is_active: bool
    created_at: datetime
    steps: List[WorkflowStepOut] = []

class WorkflowAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    task_id: uuid.UUID
    assigned_to: uuid.UUID
    assigned_at: datetime

class WorkflowTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    instance_id: uuid.UUID
    step_id: uuid.UUID
    status: str
    created_at: datetime
    step: Optional[WorkflowStepOut] = None
    assignments: List[WorkflowAssignmentOut] = []

class WorkflowHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    instance_id: uuid.UUID
    action: str
    comment: Optional[str] = None
    created_at: datetime

class WorkflowInstanceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    workflow_id: uuid.UUID
    organization_id: uuid.UUID
    status: str
    created_at: datetime
    workflow: Optional[WorkflowOut] = None
    tasks: List[WorkflowTaskOut] = []
    history: List[WorkflowHistoryOut] = []

class CompleteTaskRequest(BaseModel):
    comment: Optional[str] = None
