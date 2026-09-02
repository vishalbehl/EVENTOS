from pydantic import BaseModel, ConfigDict
import uuid
from typing import List, Optional, Any, Dict, Union


class FormFieldConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    id: str
    name: Optional[str] = None
    label: Optional[str] = ""
    type: Optional[str] = "text"
    is_default: Optional[bool] = False
    is_required: Optional[bool] = False
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 0
    step_index: Optional[int] = 0
    grid_width: Optional[str] = "full"
    options: Optional[List[Any]] = None
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    validation: Optional[Dict[str, Any]] = None
    category: Optional[str] = None


class FAQConfig(BaseModel):
    q: str
    a: str
    is_default: Optional[bool] = False


class RegistrationFormConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="allow")
    id: uuid.UUID
    event_id: uuid.UUID
    template_id: Optional[Union[uuid.UUID, str]] = None
    category_id: Optional[uuid.UUID] = None
    is_live: bool
    fields: List[Dict[str, Any]]
    settings: Optional[Dict[str, Any]] = None
    terms_and_conditions: Optional[str] = ""
    faqs: Optional[List[FAQConfig]] = None
    include_default_faqs: Optional[bool] = True
    version: int = 1


class RegistrationFormConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")
    template_id: Optional[Union[uuid.UUID, str]] = None
    category_id: Optional[uuid.UUID] = None
    is_live: Optional[bool] = None
    fields: Optional[List[Dict[str, Any]]] = None
    settings: Optional[Dict[str, Any]] = None
    terms_and_conditions: Optional[str] = None
    faqs: Optional[List[FAQConfig]] = None
    include_default_faqs: Optional[bool] = None
