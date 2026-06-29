import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

# Service Category
class ServiceCategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None

class ServiceCategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

# Service Feature
class ServiceFeatureCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None

class ServiceFeatureOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    service_id: uuid.UUID
    name: str
    description: Optional[str]

# Service Catalog Item
class ServiceCreate(BaseModel):
    category_id: uuid.UUID
    service_code: str = Field(min_length=1, max_length=50)
    service_name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    unit_type: str = "flat"
    is_internal: bool = False
    features: Optional[List[str]] = None

class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID]
    category_id: uuid.UUID
    service_code: str
    service_name: str
    description: Optional[str]
    unit_type: str
    is_active: bool
    is_internal: bool
    created_at: datetime
    updated_at: datetime

# Package Service Mapping
class PackageServiceCreate(BaseModel):
    service_id: uuid.UUID
    quantity: int = Field(default=1, ge=1)

class PackageServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    service_id: uuid.UUID
    quantity: int

# Service Package
class ServicePackageCreate(BaseModel):
    package_name: str = Field(min_length=1, max_length=150)
    package_code: str = Field(min_length=1, max_length=50)
    description: Optional[str] = None
    price: Optional[float] = None
    services: List[PackageServiceCreate]

class ServicePackageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID]
    package_name: str
    package_code: str
    description: Optional[str]
    price: Optional[float]
    is_active: bool
    created_at: datetime
    updated_at: datetime

# Staff Role
class StaffRoleCreate(BaseModel):
    role_name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None

class StaffRoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role_name: str
    description: Optional[str]



# Staff Skill
class StaffSkillCreate(BaseModel):
    role_id: uuid.UUID
    skill_name: str = Field(min_length=1, max_length=100)

class StaffSkillOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    role_id: uuid.UUID
    skill_name: str
