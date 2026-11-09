import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class EventUser(Base):
    """
    Event-scoped participant / author / speaker / reviewer identity profile.
    Created or updated automatically when a user logs in via OTP to an event portal.
    """
    __tablename__ = "events_users"
    __table_args__ = (
        UniqueConstraint("event_id", "email", name="uq_events_users_event_email"),
        Index("ix_events_users_event_email", "event_id", "email"),
        Index("ix_events_users_is_reviewer", "event_id", "is_reviewer"),
        {"schema": "events"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="SET NULL"),
        nullable=True,
    )
    email: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        index=True,
    )
    phone: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )
    full_name: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    title: Mapped[Optional[str]] = mapped_column(
        String(40),
        nullable=True,
    )
    affiliation: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    designation: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )
    country: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )
    avatar_url: Mapped[Optional[str]] = mapped_column(
        String(600),
        nullable=True,
    )
    bio: Mapped[Optional[str]] = mapped_column(
        Text,
        nullable=True,
    )
    roles: Mapped[List[str]] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: ["DELEGATE"],
    )
    is_registered: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participants.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_speaker: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    speaker_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("speakers.speakers.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_reviewer: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )
    reviewer_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("abstract.abstract_reviewers.id", ondelete="SET NULL"),
        nullable=True,
    )
    reviewer_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="NONE",
    )
    profile_data: Mapped[Dict[str, Any]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
    )
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
