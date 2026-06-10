import uuid
from datetime import datetime
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, ARRAY, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.database import SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.speaker import Speaker
    from app.modules.events.models.event import Event
    from app.modules.platform.models.organization import Organization


class SpeakerProfile(Base, SoftDeleteMixin):
    """
    Detailed profile information for a speaker, specific to an event.
    """
    __tablename__ = "speaker_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    speaker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.speakers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extended_bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    profile_photo_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    cv_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    template_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    designation: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    organisation_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    website_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    linkedin_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    twitter_url: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    research_interests: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )
    languages_spoken: Mapped[List[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default="{}"
    )

    photo_consent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_updated_by: Mapped[str] = mapped_column(String(20), nullable=False, default="organiser")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Relationships
    speaker: Mapped["Speaker"] = relationship("Speaker", back_populates="profile")
    event: Mapped["Event"] = relationship("Event")
    organization: Mapped["Organization"] = relationship("Organization")

    __table_args__ = (
        UniqueConstraint("speaker_id", "event_id", name="uq_speaker_event_profile"),
    )

    def __repr__(self) -> str:
        return f"<SpeakerProfile id={self.id} speaker_id={self.speaker_id} event_id={self.event_id}>"
