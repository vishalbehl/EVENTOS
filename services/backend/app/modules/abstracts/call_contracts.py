"""Validated abstract-call inputs and versioned response contract."""
import uuid
from copy import deepcopy
from datetime import datetime
from typing import Any, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictStr, field_validator, model_validator


class AbstractCallPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["DRAFT", "OPEN", "CLOSED", "PUBLISHED"] = "DRAFT"
    opens_at: Optional[datetime] = None
    closes_at: Optional[datetime] = None
    revision_deadline: Optional[datetime] = None
    min_words: int = Field(default=50, ge=1, le=2000, strict=True)
    max_words: int = Field(default=300, ge=1, le=5000, strict=True)
    abstract_types: list[StrictStr] = Field(default_factory=lambda: ["ORAL", "POSTER"], max_length=20)
    topics: list[StrictStr] = Field(default_factory=list, max_length=200)
    author_rules: dict[str, Any] = Field(default_factory=dict)
    attachment_rules: dict[str, Any] = Field(default_factory=dict)
    disclosure_rules: dict[str, Any] = Field(default_factory=dict)
    email_triggers: dict[str, Any] = Field(default_factory=dict)
    blind_review_enabled: StrictBool = False
    allow_coauthors: StrictBool = True
    max_coauthors: Optional[int] = Field(5, ge=0, le=30, strict=True)
    require_presenter: StrictBool = True
    require_affiliation: StrictBool = True
    require_country: StrictBool = True
    max_submissions_per_author: Optional[int] = Field(None, ge=1, le=100, strict=True)
    require_attachments: StrictBool = False
    allowed_file_extensions: Union[list[str], str] = Field(default_factory=lambda: ["pdf", "docx"])
    max_file_size_mb: int = Field(25, ge=1, le=2048, strict=True)
    require_disclosures: StrictBool = False
    evaluation_plan_id: Optional[uuid.UUID] = None
    target_reviews_per_submission: int = Field(2, ge=1, le=20, strict=True)
    categories: list[StrictStr] = Field(default_factory=list, max_length=100)
    portal_settings: Optional[dict[str, Any]] = None

    @field_validator("allowed_file_extensions")
    @classmethod
    def extensions(cls, value):
        import re
        values = value.split(",") if isinstance(value, str) else value
        result = [item.strip().lower().lstrip(".") for item in values]
        if (not 1 <= len(result) <= 30 or len(result) != len(set(result)) or
                any(not re.fullmatch(r"[a-z0-9]{1,10}", item) for item in result) or
                len(",".join(result)) > 100):
            raise ValueError("Invalid allowed file extensions.")
        return result

    @field_validator("topics", "categories", "abstract_types")
    @classmethod
    def normalized_options(cls, values, info):
        limit = 40 if info.field_name == "abstract_types" else 120
        result = [value.strip().upper() if info.field_name == "abstract_types" else value.strip() for value in values]
        if any(not value or len(value) > limit for value in result) or len(result) != len(set(result)):
            raise ValueError("Invalid or duplicate abstract taxonomy options.")
        return result

    @field_validator("author_rules", "attachment_rules", "disclosure_rules", "email_triggers", "portal_settings")
    @classmethod
    def bounded_rules(cls, value):
        if value is None:
            return value
        from app.modules.events.services.settings_policy import validate_settings
        validate_settings(value, frozenset(value))
        # Validators must not mutate ORM JSON or a caller's draft by reference.
        value = deepcopy(value)
        portal = value if "submission_portal" in value or "review_portal" in value else value.get("portal_settings")
        if portal is not None:
            if not isinstance(portal, dict) or set(portal) - {"submission_portal", "review_portal"}:
                raise ValueError("Unsupported portal configuration.")
            text_fields = {"access_mode", "guidelines_text", "feedback_release_policy", "success_message",
                "support_email", "support_phone", "peer_visibility_mode", "mandatory_comments_policy"}
            supported = {
                "submission_portal": {"access_mode", "show_countdown_banner", "show_taxonomy_guide", "guidelines_text",
                    "allow_author_edits", "allow_author_withdrawal", "require_coauthor_verification",
                    "feedback_release_policy", "success_message", "support_email", "support_phone"},
                "review_portal": {"redact_author_names", "redact_affiliations", "redact_coauthors", "peer_visibility_mode",
                    "show_aggregate_scores", "allow_review_editing", "mandatory_comments_policy", "enforce_coi_declaration",
                    "auto_warn_institutional_conflict", "in_browser_pdf_viewer", "reminders"},
            }
            for section, settings in portal.items():
                if not isinstance(settings, dict) or set(settings) - supported[section]:
                    raise ValueError("Unsupported portal settings.")
                for key, item in settings.items():
                    if item is None and key in {"guidelines_text", "success_message", "support_email", "support_phone"}:
                        settings[key] = ""
                        continue
                    if key == "reminders":
                        if (not isinstance(item, dict) or set(item) - {"remind_72h", "remind_48h", "remind_24h"}
                                or any(type(flag) is not bool for flag in item.values())):
                            raise ValueError("Invalid review reminders.")
                    elif (key in text_fields and not isinstance(item, str)) or (key not in text_fields and type(item) is not bool):
                        raise ValueError("Invalid portal flag or text.")
                    enum_values = {
                        "access_mode": {"OPEN_PUBLIC", "INVITED_ONLY"},
                        "feedback_release_policy": {"STATUS_ONLY", "SCORES_ONLY", "ANONYMIZED_COMMENTS", "FULL_RUBRIC"},
                        "peer_visibility_mode": {"ISOLATED", "AFTER_SUBMIT", "TRANSPARENT"},
                        "mandatory_comments_policy": {"OPTIONAL", "LOW_SCORES_ONLY", "MANDATORY_ALL"},
                    }
                    if key in enum_values and item not in enum_values[key]:
                        raise ValueError("Unsupported portal policy.")
        for key in ("require_presenter", "require_affiliation", "require_country"):
            if key in value and type(value[key]) is not bool:
                raise ValueError("Legacy author flags require booleans.")
        allowed = value.get("co_authors_allowed")
        if allowed is not None and (not isinstance(allowed, str) or
                (allowed.lower() != "none" and (not allowed.isdigit() or not 0 <= int(allowed) <= 30))):
            raise ValueError("Invalid legacy coauthor limit.")
        return value

    @model_validator(mode="after")
    def validate_schedule_and_word_limits(self) -> "AbstractCallPayload":
        for value in (self.opens_at, self.closes_at, self.revision_deadline):
            if value is not None and value.tzinfo is None:
                raise ValueError("Schedule timestamps require an explicit timezone.")
        for key, canonical in (("categories", self.categories), ("topics", self.topics),
                ("session_formats", self.abstract_types)):
            if key in self.author_rules:
                alias = self.author_rules[key]
                if not isinstance(alias, list) or any(not isinstance(value, str) for value in alias):
                    raise ValueError("Invalid legacy taxonomy aliases.")
                normalized = [value.strip().upper() if key == "session_formats" else value.strip() for value in alias]
                if normalized != canonical:
                    raise ValueError("Legacy taxonomy aliases conflict with normalized configuration.")
                self.author_rules[key] = canonical
        if self.min_words > self.max_words:
            raise ValueError("min_words must not exceed max_words")
        if self.opens_at and self.closes_at and self.closes_at <= self.opens_at:
            raise ValueError("closes_at must be after opens_at")
        if self.revision_deadline and self.closes_at and self.revision_deadline < self.closes_at:
            raise ValueError("revision_deadline must not be before closes_at")
        if len(set(self.abstract_types)) != len(self.abstract_types):
            raise ValueError("abstract_types must not contain duplicates")
        if len(self.abstract_types) > 20 or len(self.topics) > 200:
            raise ValueError("abstract call options exceed the supported limit")
        return self


class AbstractCallResponse(AbstractCallPayload):
    id: uuid.UUID
    event_id: uuid.UUID
    version: int
    published_at: Optional[datetime] = None


AbstractCallResponse.model_rebuild()
