from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class ProgrammeMembership(Base):
    """Event-scoped programme team role; independent from organisation membership."""

    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("event_id", "email", name="uq_programme_memberships_event_email"),
        {"schema": "programme"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    display_name: Mapped[str] = mapped_column(String(180), nullable=False)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="EVALUATOR")
    anonymous_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="INVITED", index=True)
    expertise_topics: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    invited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class ProgrammeAccessGrant(Base):
    """Hashed, revocable external access grant for authors, reviewers, and speakers."""

    __tablename__ = "access_grants"
    __table_args__ = (
        Index("ix_programme_access_grants_lookup", "token_hash", "status"),
        Index("ix_programme_access_grants_event_audience", "event_id", "audience", "status"),
        {"schema": "programme"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    audience: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    resource_type: Mapped[str | None] = mapped_column(String(48), nullable=True)
    resource_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    permissions: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="ACTIVE", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)


class ProgrammeEvaluationPlan(Base):
    """Reusable, event-scoped review plan for abstract and session submissions."""

    __tablename__ = "evaluation_plans"
    __table_args__ = (
        UniqueConstraint("event_id", "name", name="uq_programme_evaluation_plans_event_name"),
        Index("ix_programme_rubric_owner_cursor", "organization_id", "id"),
        {"schema": "programme"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    source_type: Mapped[str] = mapped_column(String(32), nullable=False, default="ABSTRACT")
    scope_filter: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    rubric: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    reviewer_ids: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    anonymous_review: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class ProgrammeSchedulePublication(Base):
    """Public schedule publication and feed policy; agenda versions remain the immutable snapshots."""

    __tablename__ = "schedule_publications"
    __table_args__ = (UniqueConstraint("event_id", name="uq_programme_schedule_publications_event"), {"schema": "programme"})

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    agenda_version_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agenda.agenda_versions.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="DRAFT", index=True)
    embed_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    json_feed_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    published_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow)


class ProgrammeScheduleRevision(Base):
    """Immutable builder checkpoint used for publication history and safe rollback."""

    __tablename__ = "schedule_revisions"
    __table_args__ = (
        UniqueConstraint("event_id", "revision_number", name="uq_programme_schedule_revisions_event_number"),
        {"schema": "programme"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str | None] = mapped_column(String(180), nullable=True)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
