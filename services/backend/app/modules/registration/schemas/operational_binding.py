import uuid
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field
from .form_builder import FormFieldSchema, FormTemplateResponse

OperationalPurpose = Literal["SPEAKER_INTAKE", "SURVEY"]


class OperationalBindingUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_template_id: uuid.UUID
    source_version: int = Field(ge=1, strict=True)
    name: str | None = Field(None, min_length=2, max_length=150)
    fields: list[FormFieldSchema] = Field(default_factory=list, max_length=100)
    settings: dict = Field(default_factory=dict)

class OperationalBindingResponse(BaseModel):
    id: uuid.UUID | None = None
    event_id: uuid.UUID
    purpose: OperationalPurpose
    template_id: uuid.UUID | None = None
    version: int = 1
    template: FormTemplateResponse | None = None
