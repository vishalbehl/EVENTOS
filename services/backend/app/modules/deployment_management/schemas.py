import uuid
from datetime import date, datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

# Deployments
class DeploymentCreate(BaseModel):
    deployment_number: str = Field(min_length=1, max_length=50)
    deployment_date: date
    deployment_status: str = "PLANNED"

class DeploymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    deployment_number: str
    deployment_date: date
    deployment_status: str

# Deployment Checklists
class DeploymentChecklistCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    status: str = "PENDING"

class DeploymentChecklistOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    deployment_id: uuid.UUID
    title: str
    description: Optional[str]
    status: str

# Deployment Logs
class DeploymentLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    deployment_id: uuid.UUID
    action: str
    details: Optional[str]
    performed_by: uuid.UUID
    created_at: datetime
    performer_name: Optional[str] = None

# Readiness Scores
class ReadinessScoreOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    technology_score: float
    staff_score: float
    equipment_score: float
    network_score: float
    overall_score: float
    last_calculated: datetime

# Risks
class RiskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None
    severity: str = "MEDIUM" # LOW, MEDIUM, HIGH, CRITICAL
    probability: str = "MEDIUM" # LOW, MEDIUM, HIGH
    mitigation_plan: Optional[str] = None
    status: str = "IDENTIFIED"

class RiskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    probability: Optional[str] = None
    mitigation_plan: Optional[str] = None
    status: Optional[str] = None

class RiskOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    title: str
    description: Optional[str]
    severity: str
    probability: str
    mitigation_plan: Optional[str]
    status: str
