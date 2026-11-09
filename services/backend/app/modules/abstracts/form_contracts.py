"""Shared, allowlisted contracts for abstract-form configuration."""
import uuid
from datetime import datetime
from typing import Any
from pydantic import BaseModel, ConfigDict, Field, StrictBool, model_validator
from app.modules.registration.schemas.form_builder import FormTemplateResponse
from app.modules.registration.schemas.event_form_contracts import abstract_schema_projection, form_document


class AbstractFormPayload(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")
    title: str = Field(default="Abstract submission form", min_length=3, max_length=180)
    form_schema: dict[str, Any] = Field(default_factory=dict, alias="schema")
    is_active: StrictBool = True
    publish: StrictBool = False
    source_template_id: uuid.UUID | None = None
    source_version: int | None = Field(None, ge=1, strict=True)

    @model_validator(mode="after")
    def validate_configuration(self):
        if not self.is_active:
            raise ValueError("Use publish=false to unpublish the current form.")
        if (self.source_template_id is None) != (self.source_version is None):
            raise ValueError("Template identity and loaded version are required together.")
        if self.source_template_id is not None and len(self.title) > 150:
            raise ValueError("A template-backed form title supports at most 150 characters.")
        if set(self.form_schema) - {"fields", "settings", "template_id", "rubric"}:
            raise ValueError("Unexpected form schema fields.")
        fields = self.form_schema.get("fields", [])
        if not isinstance(fields, list) or len(fields) > 100:
            raise ValueError("A form supports at most 100 fields.")
        settings = self.form_schema.get("settings", {})
        if not isinstance(settings, dict) or len(settings) > 100:
            raise ValueError("Invalid form settings.")
        rubric = self.form_schema.get("rubric", [])
        if not isinstance(rubric, list) or len(rubric) > 100:
            raise ValueError("Invalid rubric.")
        self.form_schema = abstract_schema_projection(self.form_schema)
        return self


class AbstractFormResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: uuid.UUID
    event_id: uuid.UUID
    title: str
    form_schema: dict[str, Any] = Field(alias="schema")
    is_active: bool
    publish: bool
    version: int
    published_at: datetime | None
    saved_template: FormTemplateResponse | None = None

    @model_validator(mode="after")
    def safe_schema(self):
        self.form_schema = abstract_schema_projection(self.form_schema, stored=True, event_id=self.event_id)
        if self.saved_template is not None:
            document = form_document(self.saved_template.fields, self.saved_template.settings,
                stored=True, event_id=self.event_id)
            self.saved_template.fields, self.saved_template.settings = document["fields"], document["settings"]
            self.saved_template.preview_image_url = None
        return self
