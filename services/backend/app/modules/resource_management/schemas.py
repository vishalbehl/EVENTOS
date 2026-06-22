import uuid
from datetime import date
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

# Resource Plans
class ResourcePlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: Optional[str] = None

class ResourcePlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    description: Optional[str]

# Resource Allocations
class ResourceAllocationCreate(BaseModel):
    resource_type: str = Field(min_length=1, max_length=50) # STAFF, EQUIPMENT, THIRD_PARTY
    resource_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)
    start_date: date
    end_date: date

class ResourceAllocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    resource_type: str
    resource_id: uuid.UUID
    quantity: int
    start_date: date
    end_date: date
    status: str

# Staff Assignments
class StaffAssignmentCreate(BaseModel):
    employee_id: uuid.UUID
    role_id: uuid.UUID
    allocation_percentage: float = Field(default=100.0, ge=0.0, le=100.0)
    start_date: date
    end_date: date

class StaffAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    employee_id: uuid.UUID
    role_id: uuid.UUID
    allocation_percentage: float
    start_date: date
    end_date: date
    employee_name: Optional[str] = None
    role_name: Optional[str] = None

# Equipment Assignments
class EquipmentAssignmentCreate(BaseModel):
    hardware_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)
    start_date: date
    end_date: date

class EquipmentAssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    hardware_id: uuid.UUID
    quantity: int
    start_date: date
    end_date: date
    hardware_name: Optional[str] = None

# Travel Plans
class TravelPlanCreate(BaseModel):
    employee_id: uuid.UUID
    city: str = Field(min_length=1, max_length=100)
    hotel: Optional[str] = Field(None, max_length=150)
    arrival_date: date
    departure_date: date

class TravelPlanUpdate(BaseModel):
    city: Optional[str] = None
    hotel: Optional[str] = None
    arrival_date: Optional[date] = None
    departure_date: Optional[date] = None
    status: Optional[str] = None

class TravelPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    project_id: uuid.UUID
    employee_id: uuid.UUID
    city: str
    hotel: Optional[str]
    arrival_date: date
    departure_date: date
    status: str
    employee_name: Optional[str] = None
