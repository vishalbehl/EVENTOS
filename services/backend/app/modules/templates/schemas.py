import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict

class TemplateCategoryBase(BaseModel):
    name: str
    description: Optional[str] = None

class TemplateCategoryCreate(TemplateCategoryBase):
    pass

class TemplateCategoryOut(TemplateCategoryBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID

class TemplateBase(BaseModel):
    name: str
    slug: Optional[str] = None
    description: Optional[str] = None
    template_type: str = "WEBSITE"
    status: str = "DRAFT"
    visibility: str = "PRIVATE"
    is_system: bool = False
    is_marketplace: bool = False

class TemplateCreate(TemplateBase):
    category_id: Optional[uuid.UUID] = None
    content: Optional[Dict[str, Any]] = None
    schema_data: Optional[Dict[str, Any]] = None
    assets: Optional[Dict[str, Any]] = None

class TemplateOut(TemplateBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    category_id: uuid.UUID
    current_version_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    created_at: datetime

class TemplateVersionBase(BaseModel):
    version_number: int
    description: Optional[str] = None
    content: Dict[str, Any]
    schema: Optional[Dict[str, Any]] = None
    assets: Optional[Dict[str, Any]] = None

class TemplateVersionCreate(BaseModel):
    description: Optional[str] = None
    content: Dict[str, Any]
    schema: Optional[Dict[str, Any]] = None
    assets: Optional[Dict[str, Any]] = None

class TemplateVersionOut(TemplateVersionBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    template_id: uuid.UUID
    published_at: datetime
    published_by: Optional[uuid.UUID] = None

class TemplateInstallationCreate(BaseModel):
    event_id: uuid.UUID
    template_id: uuid.UUID
    version_id: Optional[uuid.UUID] = None

class TemplateInstallationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    template_id: uuid.UUID
    installed_version_id: uuid.UUID
    installed_at: datetime
