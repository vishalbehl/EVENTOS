import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    ARRAY, Boolean, Date, DateTime, ForeignKey,
    Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.rbac.models.organization import Organization
    from app.modules.auth.models.user import User
    from app.modules.venue.models.room import Room
    from app.modules.speakers.models.session import Session
    from app.modules.speakers.models.speaker import Speaker
    from app.modules.presentations.models.poster import Poster
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.registration.models.import_job import ImportJob
    from app.modules.notifications.models.email_campaign import EmailCampaign
    from app.modules.notifications.models.email_template import EmailTemplate
    from app.modules.venue.models.srr_station import SRRStation
    from app.modules.venue.models.srr_checkin import SRRCheckin
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    from app.modules.venue.models.venue_sync_job import VenueSyncJob
    from app.models.audit_log import AuditLog
    from app.modules.notifications.models.webhook import Webhook
    from app.modules.presentations.models.presentation_bundle import PresentationBundle


class Event(Base):
    """
    A conference event. Everything (rooms, sessions, speakers, files)
    belongs to an event. An organization can run many events.
    """
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Who created this event
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Short code used in upload URLs — e.g. AMS26
    short_code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, index=True
    )
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    venue_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    organizer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)

    # IANA timezone, e.g. Asia/Kolkata
    timezone: Mapped[str] = mapped_column(
        String(60), nullable=False, default="Asia/Kolkata"
    )
    # Global default deadline; individual sessions can override
    upload_deadline: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    max_file_size_mb: Mapped[int] = mapped_column(
        Integer, nullable=False, default=500
    )
    # PostgreSQL array of allowed extensions: ['pptx', 'pdf', 'mp4']
    allowed_formats: Mapped[List[str]] = mapped_column(
        ARRAY(String), nullable=False, default=lambda: ["pptx", "pdf", "mp4"]
    )
    # draft | active | completed | archived
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="draft", index=True
    )
    event_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    banner_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Branding & customisation ──────────────────────────────
    # Hex colour e.g. '#1A73E8'
    theme_color: Mapped[str] = mapped_column(
        String(20), nullable=False, default="#1A73E8"
    )
    logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Licensing & feature flags ─────────────────────────────
    # starter | pro | enterprise
    license_tier: Mapped[str] = mapped_column(
        String(30), nullable=False, default="starter"
    )
    # JSONB map of feature toggles. e.g.:
    # {"enable_whatsapp": true, "enable_posters": false}
    feature_toggles: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        default=lambda: {
            "enable_whatsapp": False,
            "enable_posters": True,
            "enable_srr": True,
            "enable_signage": True,
            "enable_moderator": True,
            "enable_webhooks": False,
        },
    )

    registration_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    speaker_window_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")
    participants_list_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    
    speaker_mode_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    registration_mode_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    
    speaker_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {})
    registration_settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {})


    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # ── Relationships ─────────────────────────────────────
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="events"
    )
    creator: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[created_by], back_populates="created_events"
    )
    rooms: Mapped[List["Room"]] = relationship(
        "Room", back_populates="event", cascade="all, delete-orphan"
    )
    sessions: Mapped[List["Session"]] = relationship(
        "Session", back_populates="event", cascade="all, delete-orphan"
    )
    speakers: Mapped[List["Speaker"]] = relationship(
        "Speaker", back_populates="event", cascade="all, delete-orphan"
    )
    posters: Mapped[List["Poster"]] = relationship(
        "Poster", back_populates="event", cascade="all, delete-orphan"
    )
    presentation_files: Mapped[List["PresentationFile"]] = relationship(
        "PresentationFile", back_populates="event", cascade="all, delete-orphan"
    )
    import_jobs: Mapped[List["ImportJob"]] = relationship(
        "ImportJob", back_populates="event", cascade="all, delete-orphan"
    )
    email_campaigns: Mapped[List["EmailCampaign"]] = relationship(
        "EmailCampaign", back_populates="event", cascade="all, delete-orphan"
    )
    email_templates: Mapped[List["EmailTemplate"]] = relationship(
        "EmailTemplate", back_populates="event", cascade="all, delete-orphan"
    )
    srr_stations: Mapped[List["SRRStation"]] = relationship(
        "SRRStation", back_populates="event", cascade="all, delete-orphan"
    )
    srr_checkins: Mapped[List["SRRCheckin"]] = relationship(
        "SRRCheckin", back_populates="event", cascade="all, delete-orphan"
    )
    venue_activity_logs: Mapped[List["VenueActivityLog"]] = relationship(
        "VenueActivityLog", back_populates="event", cascade="all, delete-orphan"
    )
    venue_sync_jobs: Mapped[List["VenueSyncJob"]] = relationship(
        "VenueSyncJob", back_populates="event", cascade="all, delete-orphan"
    )
    audit_logs: Mapped[List["AuditLog"]] = relationship(
        "AuditLog", back_populates="event"
    )
    webhooks: Mapped[List["Webhook"]] = relationship(
        "Webhook", back_populates="event", cascade="all, delete-orphan"
    )
    presentation_bundles: Mapped[List["PresentationBundle"]] = relationship(
        "PresentationBundle", back_populates="event", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} short_code={self.short_code} status={self.status}>"
