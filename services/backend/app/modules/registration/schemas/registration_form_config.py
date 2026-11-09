from .event_form_contracts import form_document
from .catalogue_contracts import CatalogueField
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr, field_validator, model_validator
import uuid
from typing import List, Optional, Any, Dict, Union


class FormFieldConfig(CatalogueField):
    """Compatibility name for the shared strict field contract."""


class FAQConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: StrictStr = Field(max_length=4096)
    a: StrictStr = Field(max_length=65536)
    is_default: Optional[StrictBool] = False


class RegistrationFormConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True, extra="forbid")
    id: uuid.UUID
    event_id: uuid.UUID
    template_id: Optional[Union[uuid.UUID, str]] = None
    category_id: Optional[uuid.UUID] = None
    is_live: bool
    fields: List[Dict[str, Any]] = Field(max_length=100)
    settings: Optional[Dict[str, Any]] = None
    terms_and_conditions: Optional[str] = Field("", max_length=65536)
    faqs: Optional[List[FAQConfig]] = Field(None, max_length=100)
    include_default_faqs: Optional[bool] = True
    version: int = 1

    @model_validator(mode="after")
    def safe_document(self):
        document = form_document(self.fields, self.settings or {}, stored=True, event_id=self.event_id)
        self.fields, self.settings = document["fields"], document["settings"]
        return self


class RegistrationFormConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: Optional[Union[uuid.UUID, str]] = None
    category_id: Optional[uuid.UUID] = None
    is_live: Optional[StrictBool] = None
    fields: Optional[List[Dict[str, Any]]] = Field(default=None, max_length=100)
    settings: Optional[Dict[str, Any]] = None
    terms_and_conditions: Optional[str] = Field(default=None, max_length=65536)
    faqs: Optional[List[FAQConfig]] = Field(default=None, max_length=100)
    include_default_faqs: Optional[StrictBool] = None

    @model_validator(mode="after")
    def template_requires_document(self):
        if self.template_id is not None and self.fields is None:
            raise ValueError("Template selection requires an explicit form document.")
        return self

    @field_validator("fields")
    @classmethod
    def field_contract(cls, value):
        if value is None:
            return value
        # Validate fields without requiring their paired steps until the command.
        from .catalogue_contracts import CatalogueField
        result = []
        for field in value:
            item = dict(field)
            item.setdefault("name", item.get("id"))
            item.setdefault("label", item.get("name") or item.get("id"))
            result.append(CatalogueField.model_validate(item).model_dump(mode="json", exclude_none=True))
        return result

    @field_validator("settings")
    @classmethod
    def settings_contract(cls, value):
        if value is None:
            return value
        from .event_form_contracts import EventFormSettings
        return EventFormSettings.model_validate(value).model_dump(mode="json", exclude_none=True)
