import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any, Union, Literal
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator
from app.modules.registration.catalogue_limits import MAX_CATEGORY_KEY_LENGTH


class FormFieldOptionSchema(BaseModel):
    label: str
    value: str
    is_default: Optional[bool] = False


class FormFieldValidationSchema(BaseModel):
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pattern: Optional[str] = None
    custom_error_message: Optional[str] = None
    allowed_file_types: Optional[List[str]] = None
    max_file_size_mb: Optional[int] = None


class FormFieldSchema(BaseModel):
    id: str
    name: str
    label: str
    type: str # text, textarea, email, phone, number, date, time, select, radio, checkbox, country, role, file, image, rating, nps, terms, section_header, divider, rich_text
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    default_value: Optional[Any] = None
    is_required: bool = False
    is_active: bool = True
    is_default: bool = False
    sort_order: int = 0
    step_index: Optional[int] = 0
    grid_width: Optional[str] = "full"
    options: Optional[Union[List[str], List[FormFieldOptionSchema], List[Dict[str, Any]]]] = None
    validation: Optional[FormFieldValidationSchema] = None
    category: Optional[str] = None


class FAQItemSchema(BaseModel):
    q: str
    a: str
    is_default: Optional[bool] = False


class FormSettingsSchema(BaseModel):
    submit_button_label: Optional[str] = "Complete Registration"
    success_title: Optional[str] = "Registration Confirmed!"
    success_message: Optional[str] = "Your registration has been successfully processed."
    redirect_url: Optional[str] = None
    allow_multiple_submissions: Optional[bool] = False
    require_login: Optional[bool] = False
    send_email_confirmation: Optional[bool] = True
    terms_and_conditions: Optional[str] = ""
    enable_terms: Optional[bool] = True
    enable_preview: Optional[bool] = True
    enable_payment: Optional[bool] = True
    steps: Optional[List[Dict[str, Any]]] = None
    faqs: Optional[List[FAQItemSchema]] = None
    include_default_faqs: Optional[bool] = True


# ── Category Schemas ──────────────────────────────────────────

class FormCategoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=2, max_length=100)
    slug: Optional[str] = Field(None, min_length=1, max_length=100, pattern="^[a-z0-9_-]+$")
    description: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field("ClipboardList", max_length=50)
    sort_order: int = Field(0, ge=0, le=100000, strict=True)


class FormCategoryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=255)
    icon: Optional[str] = Field(None, max_length=50)
    sort_order: Optional[int] = Field(None, ge=0, le=100000, strict=True)
    is_active: Optional[StrictBool] = None

    @model_validator(mode="after")
    def validate_patch(self):
        for field in ("name", "sort_order", "is_active"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("Required category fields cannot be null.")
        if self.name is not None:
            self.name = self.name.strip()
            if len(self.name) < 2:
                raise ValueError("Category name is too short.")
        return self


class FormCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    organization_id: Optional[uuid.UUID] = None
    name: str
    slug: str
    description: Optional[str] = None
    icon: Optional[str] = "ClipboardList"
    is_system: bool
    sort_order: int
    is_active: bool
    version: int = 1
    created_at: datetime
    updated_at: datetime


# ── Template Schemas ──────────────────────────────────────────

class FormTemplateCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category_id: Optional[uuid.UUID] = None
    category_key: str = Field("registration", min_length=1, max_length=MAX_CATEGORY_KEY_LENGTH)
    name: str = Field(..., min_length=2, max_length=150)
    slug: Optional[str] = Field(None, min_length=1, max_length=150, pattern="^[a-z0-9_-]+$")
    description: Optional[str] = Field(None, max_length=2000)
    organization_id: Optional[uuid.UUID] = None
    event_id: Optional[uuid.UUID] = None
    scope_type: Literal["GLOBAL", "ORGANIZATION", "EVENT"] = "ORGANIZATION"
    is_default: StrictBool = False
    fields: List[FormFieldSchema] = Field(default_factory=list, max_length=100)
    settings: Optional[Union[FormSettingsSchema, Dict[str, Any]]] = Field(default_factory=FormSettingsSchema)


class FormTemplateUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category_id: Optional[uuid.UUID] = None
    category_key: Optional[str] = Field(None, min_length=1, max_length=MAX_CATEGORY_KEY_LENGTH)
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    description: Optional[str] = Field(None, max_length=2000)
    event_id: Optional[uuid.UUID] = None
    is_default: Optional[StrictBool] = None
    is_active: Optional[StrictBool] = None
    fields: Optional[List[FormFieldSchema]] = Field(None, max_length=100)
    settings: Optional[Union[FormSettingsSchema, Dict[str, Any]]] = None

    @model_validator(mode="after")
    def validate_patch(self):
        for field in ("name", "category_key", "is_active", "is_default", "fields", "settings"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError("Required template fields cannot be null.")
        if self.name is not None:
            self.name = self.name.strip()
            if len(self.name) < 2:
                raise ValueError("Template name is too short.")
        return self


class FormTemplateSaveEventCopy(BaseModel):
    """Payload for saving a template customisation scoped to a specific event."""
    model_config = ConfigDict(extra="forbid")
    event_id: uuid.UUID
    name: Optional[str] = Field(None, min_length=2, max_length=150)
    fields: List[FormFieldSchema] = Field(default_factory=list, max_length=100)
    settings: Dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def live_document(cls, value):
        from .event_form_contracts import form_document
        if not isinstance(value, dict):
            return value
        settings = value.get("settings", {})
        document = form_document(value.get("fields", []), {} if settings is None else settings)
        return {**value, **document}


class FormTemplateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    category_id: Optional[uuid.UUID] = None
    organization_id: Optional[uuid.UUID] = None
    event_id: Optional[uuid.UUID] = None
    created_by: Optional[uuid.UUID] = None
    name: str
    slug: str
    description: Optional[str] = None
    category_key: str
    category_name: Optional[str] = None
    scope_type: str
    is_default: bool
    is_system: bool
    is_active: bool
    version: int
    fields: List[Dict[str, Any]]
    settings: Dict[str, Any]
    preview_image_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ApplyTemplateRequest(BaseModel):
    template_id: uuid.UUID
    override_fields: Optional[bool] = True
