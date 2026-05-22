import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, Field, ConfigDict

TemplateType = Literal["badge", "card", "certificate", "custom"]


class PrintTemplateCreate(BaseModel):
    template_name: str = Field(min_length=2, max_length=255)
    template_type: TemplateType = "custom"
    template_data: dict = Field(default_factory=dict)


class PrintTemplateUpdate(BaseModel):
    template_name: Optional[str] = Field(None, min_length=2, max_length=255)
    template_type: Optional[TemplateType] = None
    template_data: Optional[dict] = None


class PrintTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    event_id: Optional[uuid.UUID] = None
    template_name: str
    template_type: str = "custom"
    template_data: dict
    updated_at: datetime
