"""Bounded catalogue documents; operational event aggregates have separate contracts."""
import uuid
from typing import Annotated, Literal
from urllib.parse import unquote, urlsplit
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictFloat, StrictInt, StrictStr, field_validator, model_validator
from .form_builder import FormFieldSchema, FormTemplateCreate, FormTemplateUpdate

Text = Annotated[StrictStr, Field(max_length=2000)]
ShortText = Annotated[StrictStr, Field(max_length=255)]


class CatalogueOption(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: ShortText
    value: ShortText
    is_default: StrictBool = False


class CatalogueValidation(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    min_length: int | None = Field(None, ge=0, le=100000, strict=True)
    max_length: int | None = Field(None, ge=0, le=100000, strict=True)
    min_value: StrictInt | StrictFloat | None = None
    max_value: StrictInt | StrictFloat | None = None
    # Arbitrary regular expressions are not executable catalogue configuration.
    pattern: None = None
    custom_error_message: ShortText | None = None
    allowed_file_types: list[Annotated[StrictStr, Field(pattern=r"^\.[a-zA-Z0-9]{1,10}$")]] | None = Field(None, max_length=30)
    max_file_size_mb: int | None = Field(None, ge=1, le=2048, strict=True)

    @model_validator(mode="after")
    def ordered_bounds(self):
        for lower, upper in ((self.min_length, self.max_length), (self.min_value, self.max_value)):
            if lower is not None and upper is not None and lower > upper:
                raise ValueError("Minimum exceeds maximum.")
        return self


class CatalogueField(FormFieldSchema):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    id: Annotated[StrictStr, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")]
    name: Annotated[StrictStr, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")]
    label: ShortText
    type: Literal["text", "textarea", "email", "phone", "number", "date", "time", "datetime",
        "select", "radio", "checkbox", "multiselect", "country", "state", "title", "role",
        "file", "image", "signature", "rating", "nps", "terms", "section_header", "divider", "rich_text"]
    placeholder: ShortText | None = None
    help_text: Text | None = None
    default_value: Text | StrictBool | StrictInt | StrictFloat | list[ShortText] | None = None
    is_required: StrictBool = False
    is_active: StrictBool = True
    is_default: StrictBool = False
    sort_order: int = Field(0, ge=0, le=100000, strict=True)
    step_index: int | None = Field(0, ge=0, le=99, strict=True)
    grid_width: Literal["full", "half", "third"] | None = "full"
    options: list[ShortText] | list[CatalogueOption] | None = Field(None, max_length=500)
    validation: CatalogueValidation | None = None
    category: Literal["basic", "choice", "identity", "media", "layout"] | None = None

    @field_validator("default_value")
    @classmethod
    def bounded_default(cls, value):
        if isinstance(value, list) and len(value) > 100:
            raise ValueError("Too many default values.")
        return value

    @model_validator(mode="after")
    def reference_free_defaults(self):
        if self.id in {"__proto__", "prototype", "constructor"} or self.name in {"__proto__", "prototype", "constructor"}:
            raise ValueError("Reserved field identifier.")
        if self.type in {"file", "image", "signature", "role"} and self.default_value not in (None, ""):
            raise ValueError("Managed references cannot be embedded as catalogue defaults.")
        return self


class CatalogueStep(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: Annotated[StrictStr, Field(min_length=1, max_length=100, pattern=r"^[a-zA-Z0-9_-]+$")]
    title: ShortText
    description: Text | None = None


class CatalogueFAQ(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: ShortText
    a: Text
    is_default: StrictBool = False


class CatalogueTheme(BaseModel):
    model_config = ConfigDict(extra="forbid")
    primary_color: Annotated[StrictStr, Field(pattern=r"^#[a-fA-F0-9]{6}$")] | None = None
    border_radius: Literal["0", "0px", "4px", "8px", "12px", "16px", "24px", "rounded"] | None = None
    show_header_banner: StrictBool | None = None
    header_banner_asset_id: uuid.UUID | None = None
    header_banner_url: Literal[""] | None = None


class CatalogueSettings(BaseModel):
    model_config = ConfigDict(extra="forbid")
    submit_button_label: ShortText | None = None
    success_title: ShortText | None = None
    success_message: Text | None = None
    redirect_url: Annotated[StrictStr, Field(max_length=1000)] | None = None
    allow_multiple_submissions: StrictBool | None = None
    require_login: StrictBool | None = None
    send_email_confirmation: StrictBool | None = None
    confirmation_email_subject: ShortText | None = None
    terms_and_conditions: Annotated[StrictStr, Field(max_length=10000)] | None = None
    enable_terms: StrictBool | None = None
    enable_preview: StrictBool | None = None
    enable_payment: StrictBool | None = None
    steps: list[CatalogueStep] | None = Field(None, max_length=100)
    faqs: list[CatalogueFAQ] | None = Field(None, max_length=100)
    include_default_faqs: StrictBool | None = None
    theme: CatalogueTheme | None = None

    @field_validator("redirect_url")
    @classmethod
    def local_redirect(cls, value):
        if not value:
            return value
        # Decode before checking to reject encoded network paths/control characters.
        decoded = unquote(value)
        parsed = urlsplit(decoded)
        if (not decoded.startswith("/") or decoded.startswith("//") or "\\" in decoded or "%" in decoded
                or any(ord(char) <= 32 or ord(char) == 127 for char in decoded)
                or parsed.scheme or parsed.netloc):
            raise ValueError("Redirect must be a local absolute path.")
        return value


class CatalogueDocument(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fields: list[CatalogueField] = Field(default_factory=list, max_length=100)
    settings: CatalogueSettings = Field(default_factory=CatalogueSettings)

    @model_validator(mode="after")
    def unique_configuration(self):
        ids, names = set(), set()
        for field in self.fields:
            if field.id in ids or field.name in names:
                raise ValueError("Field identifiers and names must be unique.")
            ids.add(field.id)
            names.add(field.name)
        steps = self.settings.steps or []
        if len({step.id for step in steps}) != len(steps):
            raise ValueError("Step identifiers must be unique.")
        if any((field.step_index or 0) >= (len(steps) or 1) for field in self.fields):
            raise ValueError("Field references an unavailable step.")
        return self


class CatalogueTemplateCreate(FormTemplateCreate):
    fields: list[CatalogueField] = Field(default_factory=list, max_length=100)
    settings: CatalogueSettings = Field(default_factory=CatalogueSettings)


class CatalogueTemplateUpdate(FormTemplateUpdate):
    fields: list[CatalogueField] | None = Field(None, max_length=100)
    settings: CatalogueSettings | None = None


class GlobalTemplateRetirement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    replacement_template_id: uuid.UUID
    reason: Annotated[StrictStr, Field(min_length=8, max_length=500)]


class GlobalTemplateRetirementResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: uuid.UUID
    replacement_template_id: uuid.UUID
    version: int
    status: Literal["RETIRED"]
    reassigned: dict[Literal["registration", "active_abstract_forms"], int]


class GlobalCategoryRetirement(BaseModel):
    model_config = ConfigDict(extra="forbid")
    replacement_category_id: uuid.UUID
    reason: Annotated[StrictStr, Field(min_length=8, max_length=500)]


class GlobalCategoryRetirementResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category_id: uuid.UUID
    replacement_category_id: uuid.UUID
    version: int
    status: Literal["RETIRED"]
    reassigned: dict[Literal["templates", "registration_forms"], int]


class CatalogueReconciliationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    cursor: uuid.UUID | None = None
    page_size: int = Field(50, ge=1, le=100, strict=True)


class CatalogueReconciliationResult(BaseModel):
    checked: int
    normalized: int
    blocked: int
    next_cursor: uuid.UUID | None = None


class CatalogueReconciliationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reconciliation_id: uuid.UUID
    template_id: uuid.UUID
    template_name: str
    template_version: int
    reason: str
    created_at: str


class CategoryReconciliationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reconciliation_id: uuid.UUID
    category_id: uuid.UUID
    category_name: str
    category_slug: str
    category_version: int
    reason: str
    details: dict
    created_at: str
    current_document: dict | None = None


class CatalogueRepairRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: CatalogueDocument
    reason: Annotated[StrictStr, Field(min_length=8, max_length=500)]
    replacement_category_id: uuid.UUID | None = None
    detach_invalid_source_lineage: StrictBool = False

    @model_validator(mode="after")
    def meaningful_detachment_reason(self):
        if self.detach_invalid_source_lineage and len(self.reason.strip()) < 8:
            raise ValueError("Invalid-source detachment requires a meaningful review reason.")
        return self


class CatalogueRepairResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    template_id: uuid.UUID
    previous_version: int
    version: int
    status: Literal["REPAIRED"]


class AggregateReconciliationIssue(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reconciliation_id: uuid.UUID
    organization_id: uuid.UUID
    event_id: uuid.UUID | None = None
    resource_type: Literal["FORM_CATEGORY", "REGISTRATION_FORM", "ABSTRACT_FORM", "PROGRAMME_RUBRIC"]
    resource_id: uuid.UUID
    resource_version: int
    reason: str
    created_at: str
    current_document: dict | None = None


class AggregateRepairRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document: dict
    reason: Annotated[StrictStr, Field(min_length=8, max_length=500)]
    detach_invalid_registration_references: StrictBool = False

    @model_validator(mode="after")
    def meaningful_reference_reason(self):
        if self.detach_invalid_registration_references and len(self.reason.strip()) < 8:
            raise ValueError("Reference detachment requires a meaningful review reason.")
        return self


class CategoryRepairDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: Annotated[StrictStr, Field(min_length=2, max_length=100)]
    slug: Annotated[StrictStr, Field(min_length=1, max_length=100,
        pattern="^[a-z0-9_-]+$")]
    description: Annotated[StrictStr, Field(max_length=255)] | None = None
    icon: Annotated[StrictStr, Field(max_length=50)] | None = None
    sort_order: int = Field(ge=0, le=100000, strict=True)


class AggregateRepairResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    resource_type: Literal["FORM_CATEGORY", "REGISTRATION_FORM", "ABSTRACT_FORM", "PROGRAMME_RUBRIC"]
    resource_id: uuid.UUID
    previous_version: int
    version: int
    status: Literal["REPAIRED"]


class CohortReconciliationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    reason: Annotated[StrictStr, Field(min_length=8, max_length=500)]


class CohortReconciliationAccepted(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: uuid.UUID
    status: Literal["SCHEDULED"]


class CohortReconciliationStatus(BaseModel):
    model_config = ConfigDict(extra="forbid")
    run_id: uuid.UUID
    status: Literal["PENDING", "RUNNING", "DISPATCHED", "FAILED"]
    dispatch_attempts: int
    started_at: str | None = None
    dispatched_at: str | None = None
    failure_code: str | None = None
    completion_status: Literal["PENDING", "COMPLETED", "FAILED", "LEGACY_UNTRACKED"] = "LEGACY_UNTRACKED"
    streams_total: int = 0
    streams_completed: int = 0
    pages_completed: int = 0
    checked_count: int = 0
    blocked_count: int = 0
