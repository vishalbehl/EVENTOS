from __future__ import annotations

from datetime import datetime
import json
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from app.modules.registration.schemas.event_form_contracts import (
    MAX_EVALUATION_RUBRIC_CRITERIA,
    ReviewScores,
    abstract_schema_projection,
    evaluation_rubric_projection,
)


class ProgrammeAccessGrantCreate(BaseModel):
    audience: str = Field(pattern="^(AUTHOR|REVIEWER|SPEAKER)$")
    email: EmailStr
    resource_type: str | None = Field(default=None, max_length=48)
    resource_id: UUID | None = None
    permissions: dict[str, Any] = Field(default_factory=dict)
    expires_in_days: int = Field(default=14, ge=1, le=90)


class ProgrammeAccessGrantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    audience: str
    email: EmailStr
    resource_type: str | None
    resource_id: UUID | None
    permissions: dict[str, Any]
    status: str
    version: int
    expires_at: datetime
    consumed_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime


class ProgrammeAccessGrantIssued(ProgrammeAccessGrantResponse):
    access_token: str


class ProgrammeSpeakerProfileUpdate(BaseModel):
    expected_version: int = Field(ge=1)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)
    designation: str | None = Field(default=None, max_length=255)
    affiliation: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=100)
    bio: str | None = Field(default=None, max_length=20_000)
    photo_url: str | None = Field(default=None, max_length=2_000)
    social_links: dict[str, Any] | None = None
    research_interests: list[str] = Field(default_factory=list, max_length=50)
    programme_availability: dict[str, list[dict[str, str]]] | None = None
    programme_custom_fields: dict[str, Any] | None = None
    programme_travel_details: dict[str, Any] | None = None


class ProgrammeSpeakerPortalResponse(BaseModel):
    speaker_id: UUID
    event_id: UUID
    event_name: str
    first_name: str
    last_name: str
    email: EmailStr
    designation: str | None = None
    affiliation: str | None = None
    country: str | None = None
    bio: str | None = None
    photo_url: str | None = None
    social_links: dict[str, Any] | None = None
    research_interests: list[str] = Field(default_factory=list)
    programme_availability: dict[str, list[dict[str, str]]] = Field(default_factory=dict)
    programme_custom_fields: dict[str, Any] = Field(default_factory=dict)
    programme_travel_details: dict[str, Any] = Field(default_factory=dict)
    version: int
    participation: str
    sessions: list[dict[str, Any]] = Field(default_factory=list)
    files: list[dict[str, Any]] = Field(default_factory=list)


class ProgrammeMembershipCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=180)
    role: str = Field(default="EVALUATOR", pattern="^(OWNER|ORGANIZER|CONTENT_OWNER|CONTENT_MANAGER|CONTENT_VIEWER|EVALUATOR)$")
    anonymous_review: bool = False
    expertise_topics: list[str] = Field(default_factory=list, max_length=50)
    capacity: int = Field(default=10, ge=1, le=500)


class ProgrammeMembershipResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: EmailStr
    display_name: str
    role: str
    anonymous_review: bool
    expertise_topics: list[str]
    capacity: int
    status: str
    version: int


class EvaluationRubricContract(BaseModel):
    @field_validator("rubric", check_fields=False)
    @classmethod
    def safe_rubric(cls, value):
        return evaluation_rubric_projection(value)

    @field_validator("scope_filter", check_fields=False)
    @classmethod
    def bounded_scope(cls, value):
        try:
            encoded = json.dumps(value, allow_nan=False, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        except (TypeError, ValueError, RecursionError):
            raise ValueError("Invalid evaluation scope document.") from None
        if len(encoded) > 128 * 1024:
            raise ValueError("Evaluation scope document exceeds its size limit.")
        return value

    @field_validator("reviewer_ids", check_fields=False)
    @classmethod
    def unique_reviewers(cls, value):
        if len(value) != len(set(value)):
            raise ValueError("Reviewer identifiers must be unique.")
        return value

    @field_validator("name", check_fields=False)
    @classmethod
    def meaningful_name(cls, value):
        if not value.strip():
            raise ValueError("Evaluation plan name is required.")
        return value.strip()

    @field_validator("due_at", check_fields=False)
    @classmethod
    def explicit_deadline_timezone(cls, value):
        if value is not None and (value.tzinfo is None or value.utcoffset() is None):
            raise ValueError("Evaluation deadline requires an explicit timezone.")
        return value


class EvaluationPlanWriteContract(EvaluationRubricContract):
    @model_validator(mode="after")
    def bounded_replay_document(self):
        from app.config import settings
        # Reserve space for server-owned ID/version/status fields in the exact
        # allowlisted replay snapshot. Reject, never truncate scoring content.
        size = len(json.dumps(self.model_dump(mode="json"), separators=(",", ":")).encode("utf-8"))
        if size + 4096 > settings.IDEMPOTENCY_MAX_RESPONSE_BYTES:
            raise ValueError("Evaluation plan exceeds the configured replay-document budget.")
        return self


class ProgrammeEvaluationPlanCreate(EvaluationPlanWriteContract):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=180)
    source_type: str = Field(default="ABSTRACT", pattern="^(ABSTRACT|SESSION)$")
    scope_filter: dict[str, Any] = Field(default_factory=dict)
    rubric: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EVALUATION_RUBRIC_CRITERIA)
    reviewer_ids: list[UUID] = Field(default_factory=list, max_length=200)
    due_at: datetime | None = None
    anonymous_review: bool = Field(default=False, strict=True)


class ProgrammeEvaluationPlanUpdate(EvaluationPlanWriteContract):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1, strict=True)
    name: str = Field(min_length=1, max_length=180)
    scope_filter: dict[str, Any] = Field(default_factory=dict)
    rubric: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EVALUATION_RUBRIC_CRITERIA)
    reviewer_ids: list[UUID] = Field(default_factory=list, max_length=200)
    due_at: datetime | None = None
    anonymous_review: bool = Field(default=False, strict=True)


class ProgrammeEvaluationPlanResponse(EvaluationRubricContract):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    source_type: str
    scope_filter: dict[str, Any]
    rubric: list[dict[str, Any]] = Field(max_length=MAX_EVALUATION_RUBRIC_CRITERIA)
    reviewer_ids: list[str]
    due_at: datetime | None
    anonymous_review: bool
    status: str
    version: int


class ProgrammeEvaluationPlanApply(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assignments_per_submission: int = Field(default=2, ge=1, le=10, strict=True)
    cursor: UUID | None = None


class ProgrammeEvaluationPlanApplyResult(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_id: UUID
    version: int = Field(ge=1)
    assignments_created: int = Field(ge=0)
    submissions_considered: int = Field(ge=0, le=100)
    submissions_unfilled: int = Field(ge=0, le=100)
    has_next: bool
    next_cursor: UUID | None = None


class ProgrammeLifecycleResponse(BaseModel):
    event_id: UUID
    call_status: str | None
    submissions: dict[str, int]
    reviewers: dict[str, int]
    speakers: dict[str, int]
    schedule: dict[str, Any]
    actions: list[dict[str, str]]


class PublicAbstractCallResponse(BaseModel):
    event_id: UUID
    event_name: str
    opens_at: datetime | None
    closes_at: datetime | None
    revision_deadline: datetime | None
    min_words: int
    max_words: int
    abstract_types: list[str]
    topics: list[str]
    categories: list[str] = Field(default_factory=list)
    allow_coauthors: bool = True
    max_coauthors: int | None = 5
    require_presenter: bool = True
    require_affiliation: bool = True
    require_country: bool = True
    require_attachments: bool = False
    allowed_file_extensions: list[str] = Field(default_factory=lambda: ["pdf", "docx"])
    max_file_size_mb: int = 25
    require_disclosures: bool = False
    portal_settings: dict[str, Any] = Field(default_factory=dict)
    author_rules: dict[str, Any] = Field(default_factory=dict)
    attachment_rules: dict[str, Any] = Field(default_factory=dict)
    disclosure_rules: dict[str, Any] = Field(default_factory=dict)
    form_title: str
    form_schema: dict[str, Any]

    @model_validator(mode="after")
    def safe_form(self):
        document = abstract_schema_projection(self.form_schema, stored=True, event_id=self.event_id)
        self.form_schema = {"fields": document["fields"], "settings": {
            key: value for key, value in document["settings"].items()
            if key not in {"event_id", "_event_id", "_source_template_id"}
        }}
        return self



class PublicAbstractAuthor(BaseModel):
    full_name: str = Field(min_length=2, max_length=180)
    email: EmailStr | None = None
    affiliation: str | None = Field(default=None, max_length=255)
    country: str | None = Field(default=None, max_length=100)
    is_presenter: bool = False


class PublicAbstractSubmissionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=300)
    body: str = Field(min_length=10, max_length=20_000)
    keywords: list[str] = Field(default_factory=list, max_length=20)
    abstract_type: str = Field(default="ORAL", max_length=40)
    topic: str | None = Field(default=None, max_length=120)
    track: str | None = Field(default=None, max_length=120)
    form_payload: dict[str, Any] = Field(default_factory=dict)
    authors: list[PublicAbstractAuthor] = Field(min_length=1, max_length=30)


class PublicAbstractSubmissionUpdate(PublicAbstractSubmissionCreate):
    expected_version: int = Field(ge=1)


class PublicAbstractSubmissionResponse(BaseModel):
    id: UUID
    code: str
    title: str
    body: str = ""
    keywords: list[str] = Field(default_factory=list)
    abstract_type: str = "ORAL"
    topic: str | None = None
    track: str | None = None
    form_payload: dict[str, Any] = Field(default_factory=dict)
    authors: list[PublicAbstractAuthor] = Field(default_factory=list)
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    status: str
    version: int
    submitted_at: datetime | None
    decision: str | None = None
    notes_to_author: str | None = None
    author_confirmation: str | None = None


class PublicAbstractAttachmentCreate(BaseModel):
    kind: str = Field(default="SUPPORTING_FILE", min_length=1, max_length=40)
    filename: str = Field(min_length=1, max_length=255)
    storage_path: str = Field(min_length=1, max_length=600)
    mime_type: str | None = Field(default=None, max_length=120)
    file_size_bytes: int | None = Field(default=None, ge=0, le=50_000_000)


class PublicReviewerAssignment(EvaluationRubricContract):
    id: UUID
    submission_id: UUID
    submission_version: int = Field(ge=1)
    code: str
    title: str
    body: str | None = None
    abstract_type: str
    topic: str | None = None
    status: str
    due_at: datetime | None = None
    conflict_declared: bool
    anonymous: bool = False
    rubric: list[dict[str, Any]] = Field(default_factory=list, max_length=MAX_EVALUATION_RUBRIC_CRITERIA)
    authors: list[PublicAbstractAuthor] = Field(default_factory=list)
    attachments: list[dict[str, Any]] = Field(default_factory=list)
    recommendation: str | None = None
    total_score: int | None = None
    scores: dict[str, int] = Field(default_factory=dict)
    comments_to_committee: str | None = None
    comments_to_author: str | None = None


class PublicReviewerConflict(BaseModel):
    model_config = ConfigDict(extra="forbid")
    conflict_declared: Literal[True]
    conflict_reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_reason(self):
        reason = self.conflict_reason.strip() if self.conflict_reason else None
        if not reason:
            raise ValueError("A conflict reason is required when recusing.")
        self.conflict_reason = reason
        return self


class PublicReviewerConflictResult(BaseModel):
    status: Literal["CONFLICT"]
    conflict_declared: bool
    submission_version: int = Field(ge=1)


class PublicReviewerReview(BaseModel):
    model_config = ConfigDict(extra="forbid")
    scores: ReviewScores = Field(default_factory=dict)
    recommendation: str = Field(default="DISCUSS", pattern="^(ACCEPT|REJECT|REVISION|DISCUSS)$")
    comments_to_committee: str | None = Field(default=None, max_length=4000)
    comments_to_author: str | None = Field(default=None, max_length=4000)
