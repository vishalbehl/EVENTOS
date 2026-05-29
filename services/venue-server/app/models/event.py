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
    from app.models.organization import Organization
    from app.models.user import User
    from app.models.room import Room
    from app.models.session import Session
    from app.models.speaker import Speaker
    from app.models.import_job import ImportJob
    from app.models.email_campaign import EmailCampaign
    from app.models.email_template import EmailTemplate
    from app.models.srr_station import SRRStation
    from app.models.venue_sync_job import VenueSyncJob
    from app.models.audit_log import AuditLog
    from app.models.webhook import Webhook


class Event(Base):
    """
    A conference event. Everything (rooms, sessions, speakers, files)
    belongs to an event. An organization can run many events.

    This is the venue-server local mirror of the cloud backend Event model.
    Schema must remain in sync with services/backend/app/modules/rbac/models/event.py.
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
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    organizer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    organizer_details: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {"name": "", "email": "", "phone": "", "website": ""}
    )

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

    # ── Licensing & feature flags ─────────────────────────────
    # starter | pro | enterprise
    license_tier: Mapped[str] = mapped_column(
        String(30), nullable=False, default="starter"
    )
    # JSONB map of feature toggles.
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

    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")

    # ── Module Settings (JSONB) ───────────────────────────────
    speaker_settings: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        default=lambda: {"enabled": True, "window_required": True}
    )
    registration_settings: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        default=lambda: {"enabled": True, "registration_allowed": True, "participants_list_allowed": True}
    )

    # ── Branding Settings (JSONB) ─────────────────────────────
    branding_settings: Mapped[dict] = mapped_column(
        JSONB, nullable=False,
        default=lambda: {"theme_color": "#1A73E8", "logo_url": None, "banner_url": None}
    )

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

    # ── Backward-compatibility properties ─────────────────────
    @property
    def speaker_mode_enabled(self) -> bool:
        return bool((self.speaker_settings or {}).get("enabled", True))

    @property
    def registration_mode_enabled(self) -> bool:
        return bool((self.registration_settings or {}).get("enabled", True))

    @property
    def theme_color(self) -> str:
        return (self.branding_settings or {}).get("theme_color", "#1A73E8")

    @property
    def logo_url(self) -> Optional[str]:
        return (self.branding_settings or {}).get("logo_url")

    @property
    def banner_url(self) -> Optional[str]:
        return (self.branding_settings or {}).get("banner_url")

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
    import_jobs: Mapped[List["ImportJob"]] = relationship(
        "ImportJob", back_populates="event", cascade="all, delete-orphan"
    )
    email_campaigns: Mapped[List["EmailCampaign"]] = relationship(
        "EmailCampaign", back_populates="event", cascade="all, delete-orphan"
    )
    email_templates: Mapped[List["EmailTemplate"]] = relationship(
        "EmailTemplate", back_populates="event"
    )
    srr_stations: Mapped[List["SRRStation"]] = relationship(
        "SRRStation", back_populates="event", cascade="all, delete-orphan"
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

    def __repr__(self) -> str:
        return f"<Event id={self.id} short_code={self.short_code} status={self.status}>"
