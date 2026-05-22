from pydantic import BaseModel, ConfigDict
import uuid
from typing import List, Optional

class FormFieldConfig(BaseModel):
    id: str
    name: str
    label: str
    type: str # text, date, select, checkbox, file, image
    is_default: bool = False
    is_required: bool = False
    is_active: bool = True
    options: Optional[List[str]] = None
    placeholder: Optional[str] = None

class RegistrationFormConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    event_id: uuid.UUID
    is_live: bool
    fields: List[FormFieldConfig]

class RegistrationFormConfigUpdate(BaseModel):
    is_live: Optional[bool] = None
    fields: Optional[List[FormFieldConfig]] = None
