import uuid
from datetime import datetime
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, ConfigDict

class SiteBase(BaseModel):
    name: str
    slug: Optional[str] = None
    domain: Optional[str] = None
    status: str = "DRAFT"

class SiteCreate(SiteBase):
    event_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None

class SiteOut(SiteBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID
    template_id: Optional[uuid.UUID] = None
    published_at: Optional[datetime] = None
    created_at: datetime

class PageBase(BaseModel):
    name: str
    slug: str
    title: str
    description: Optional[str] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    is_homepage: bool = False
    sort_order: int = 0
    status: str = "DRAFT"

class PageCreate(PageBase):
    site_id: uuid.UUID

class PageOut(PageBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    site_id: uuid.UUID

class PageSectionBase(BaseModel):
    section_type: str
    sort_order: int = 0
    settings: Dict[str, Any] = {}

class PageSectionCreate(PageSectionBase):
    page_id: uuid.UUID

class PageSectionOut(PageSectionBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    page_id: uuid.UUID

class PageComponentBase(BaseModel):
    component_type: str
    settings: Dict[str, Any] = {}
    styles: Dict[str, Any] = {}

class PageComponentCreate(PageComponentBase):
    section_id: uuid.UUID

class PageComponentOut(PageComponentBase):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    section_id: uuid.UUID

class SaveDraftRequest(BaseModel):
    sections: List[Dict[str, Any]]
