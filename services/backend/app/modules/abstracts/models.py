from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AbstractCall(Base):
    __tablename__ = "abstract_calls"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_abstract_calls_event_id"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    opens_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revision_deadline: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    max_words: Mapped[int] = mapped_column(Integer, nullable=False, default=300)
    min_words: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    abstract_types: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: ["ORAL", "POSTER"])
    topics: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    author_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    attachment_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    disclosure_rules: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    email_triggers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    blind_review_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # Normalized relational columns
    allow_coauthors: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_coauthors: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=5)
    require_presenter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    require_affiliation: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    require_country: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    max_submissions_per_author: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    require_attachments: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    allowed_file_extensions: Mapped[str] = mapped_column(String(100), nullable=False, default="pdf,docx")
    max_file_size_mb: Mapped[int] = mapped_column(Integer, nullable=False, default=25)
    require_disclosures: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    evaluation_plan_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("programme.evaluation_plans.id", ondelete="SET NULL"), nullable=True)
    target_reviews_per_submission: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractForm(Base):
    __tablename__ = "abstract_forms"
    __table_args__ = (
        Index("ix_abstract_forms_event_active", "event_id", "is_active"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False, default="Abstract submission form")
    schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractSubmission(Base):
    __tablename__ = "abstract_submissions"
    __table_args__ = (
        Index("ix_abstract_submissions_event_status", "event_id", "status"),
        Index("ix_abstract_submissions_event_topic", "event_id", "topic"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    legacy_session_speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("agenda.session_people.id", ondelete="SET NULL"), nullable=True, index=True)
    submitter_speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("speakers.speakers.id", ondelete="SET NULL"), nullable=True, index=True)
    presenter_speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("speakers.speakers.id", ondelete="SET NULL"), nullable=True)
    linked_session_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("agenda.sessions.id", ondelete="SET NULL"), nullable=True, index=True)
    linked_poster_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("presentations.posters.id", ondelete="SET NULL"), nullable=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    keywords: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    abstract_type: Mapped[str] = mapped_column(String(40), nullable=False, default="ORAL")
    topic: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    track: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="DRAFT", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    form_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    publication_payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    final_decision: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    presentation_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    average_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractAuthor(Base):
    __tablename__ = "abstract_authors"
    __table_args__ = (Index("ix_abstract_authors_submission_order", "submission_id", "display_order"), {"schema": "abstract"})

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    affiliation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    is_presenter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class AbstractAttachment(Base):
    __tablename__ = "abstract_attachments"
    __table_args__ = {"schema": "abstract"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(40), nullable=False, default="SUPPORTING_FILE")
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[Optional[str]] = mapped_column(String(600), nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    file_size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class AbstractReviewer(Base):
    __tablename__ = "abstract_reviewers"
    __table_args__ = (
        UniqueConstraint("event_id", "email", name="uq_abstract_reviewers_event_email"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    full_name: Mapped[str] = mapped_column(String(180), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    expertise_topics: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="INVITED", index=True)
    access_token_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    invited_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractAssignment(Base):
    __tablename__ = "abstract_assignments"
    __table_args__ = (
        UniqueConstraint("submission_id", "reviewer_id", name="uq_abstract_assignment_submission_reviewer"),
        Index("ix_abstract_assignments_event_status", "event_id", "status"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_reviewers.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ASSIGNED", index=True)
    due_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    conflict_declared: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    conflict_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    assigned_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class AbstractReview(Base):
    __tablename__ = "abstract_reviews"
    __table_args__ = (
        UniqueConstraint("assignment_id", name="uq_abstract_reviews_assignment_id"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    assignment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_assignments.id", ondelete="CASCADE"), nullable=False, index=True)
    reviewer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_reviewers.id", ondelete="CASCADE"), nullable=False, index=True)
    scores: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    total_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    recommendation: Mapped[str] = mapped_column(String(32), nullable=False, default="DISCUSS")
    comments_to_committee: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    comments_to_author: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class AbstractDecision(Base):
    __tablename__ = "abstract_decisions"
    __table_args__ = {"schema": "abstract"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    submission_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_submissions.id", ondelete="CASCADE"), nullable=False, index=True)
    decision: Mapped[str] = mapped_column(String(32), nullable=False)
    presentation_type: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    notes_to_author: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    decided_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    idempotency_key: Mapped[str] = mapped_column(String(200), nullable=False, index=True)


class AbstractPortalSettings(Base):
    __tablename__ = "abstract_portal_settings"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_abstract_portal_settings_event_id"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    call_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_calls.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Submission Portal
    sub_access_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="OPEN_PUBLIC")
    sub_show_countdown: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sub_show_taxonomy_guide: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sub_guidelines_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sub_allow_edits: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sub_allow_withdrawal: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sub_require_coauthor_verify: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sub_feedback_policy: Mapped[str] = mapped_column(String(32), nullable=False, default="ANONYMIZED_COMMENTS")
    sub_success_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sub_support_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    sub_support_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    send_confirmation_email: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Review Portal
    rev_redact_author_names: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_redact_affiliations: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_redact_coauthors: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_peer_visibility: Mapped[str] = mapped_column(String(32), nullable=False, default="AFTER_SUBMIT")
    rev_show_aggregate_scores: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_allow_editing: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_mandatory_comments: Mapped[str] = mapped_column(String(32), nullable=False, default="LOW_SCORES_ONLY")
    rev_enforce_coi: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_auto_warn_institution: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_in_browser_pdf: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_remind_72h: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_remind_48h: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    rev_remind_24h: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractTopic(Base):
    __tablename__ = "abstract_topics"
    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_abstract_topics_event_name"),
        Index("ix_abstract_topics_event_id", "event_id"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    call_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_calls.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractCategory(Base):
    __tablename__ = "abstract_categories"
    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_abstract_categories_event_name"),
        Index("ix_abstract_categories_event_id", "event_id"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    call_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_calls.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractFormat(Base):
    __tablename__ = "abstract_formats"
    __table_args__ = (
        UniqueConstraint("event_id", "code", name="uq_abstract_formats_event_code"),
        Index("ix_abstract_formats_event_id", "event_id"),
        {"schema": "abstract"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    call_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_calls.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class AbstractReviewerTopic(Base):
    __tablename__ = "abstract_reviewer_topics"
    __table_args__ = {"schema": "abstract"}

    reviewer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_reviewers.id", ondelete="CASCADE"), primary_key=True)
    topic_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("abstract.abstract_topics.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


