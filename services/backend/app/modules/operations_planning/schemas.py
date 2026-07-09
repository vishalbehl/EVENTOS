import uuid
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

# Task Dependencies
class TaskDependencyCreate(BaseModel):
    task_id: uuid.UUID
    depends_on_task_id: uuid.UUID

class TaskDependencyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    task_id: uuid.UUID
    depends_on_task_id: uuid.UUID

# Project Tasks
class ProjectTaskCreate(BaseModel):
    milestone_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = "TODO"
    priority: str = "MEDIUM"
    start_date: Optional[date] = None
    due_date: Optional[date] = None

class ProjectTaskUpdate(BaseModel):
    milestone_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None

class ProjectTaskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    milestone_id: Optional[uuid.UUID]
    assigned_to: Optional[uuid.UUID]
    title: str
    description: Optional[str]
    status: str
    priority: str
    start_date: Optional[date]
    due_date: Optional[date]
    completed_at: Optional[datetime]
    created_at: datetime
    assignee_name: Optional[str] = None

# Milestones
class MilestoneCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = "PLANNED"
    start_date: Optional[date] = None
    due_date: Optional[date] = None

class MilestoneUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    due_date: Optional[date] = None
    completed_at: Optional[datetime] = None

class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str]
    status: str
    start_date: Optional[date]
    due_date: Optional[date]
    completed_at: Optional[datetime]
    tasks: List[ProjectTaskOut] = []

# Projects
class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    project_manager_id: Optional[uuid.UUID] = None

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    project_manager_id: Optional[uuid.UUID] = None
    completion_percentage: Optional[float] = None

class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    project_code: str
    name: str
    status: str
    start_date: Optional[date]
    end_date: Optional[date]
    project_manager_id: Optional[uuid.UUID]
    completion_percentage: float
    milestones: List[MilestoneOut] = []
    tasks: List[ProjectTaskOut] = []
