import uuid
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    ARRAY, Boolean, Date, DateTime, ForeignKey,
    Integer, String, Text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.platform.models.organization import Organization
    from app.modules.identity.models.user import User
    from app.modules.events.models.room import Room
    from app.modules.events.models.session import Session
    from app.modules.events.models.speaker import Speaker
    from app.modules.presentations.models.poster import Poster
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.registration.models.import_job import ImportJob
    from app.modules.communications.models.email_campaign import EmailCampaign
    from app.modules.communications.models.email_template import EmailTemplate
    from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
    from app.modules.speakers.models.speaker_theme_setting import SpeakerThemeSetting
    from app.modules.venue.models.srr_station import SRRStation
    from app.modules.venue.models.srr_checkin import SRRCheckin
    from app.modules.venue.models.venue_activity_log import VenueActivityLog
    from app.modules.venue.models.venue_sync_job import VenueSyncJob
    from app.modules.audit.models.audit_log import AuditLog
    from app.modules.integrations.models.webhook import Webhook
    from app.modules.presentations.models.presentation_bundle import PresentationBundle
    from app.modules.communications.models.announcement import Announcement


class Event(Base, SoftDeleteMixin):
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
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Who created this event
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
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
        String(30), nullable=False, default="basic"
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

    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR")

    tagline: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    map_link: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    venue_images: Mapped[List[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    venue_details: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {
            "website": "",
            "email": "",
            "phone": "",
            "facilities": [],
            "images": [],
            "notes": "",
            "map_coords": "",
        }
    )
    licensing_details: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: {
            "plan_name": "",
            "price": 0,
            "addons": [],
            "activated_at": None,
            "expires_at": None,
            "status": "inactive",
        }
    )

    # ── Theme and portal settings relationships ──────────────────
    registration_theme_setting: Mapped[Optional["RegistrationThemeSetting"]] = relationship(
        "RegistrationThemeSetting", back_populates="event", uselist=False, lazy="joined", cascade="all, delete-orphan"
    )
    speaker_theme_setting: Mapped[Optional["SpeakerThemeSetting"]] = relationship(
        "SpeakerThemeSetting", back_populates="event", uselist=False, lazy="joined", cascade="all, delete-orphan"
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

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if "registration_theme_setting" not in self.__dict__:
            from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
            self.registration_theme_setting = RegistrationThemeSetting()
        if "speaker_theme_setting" not in self.__dict__:
            from app.modules.speakers.models.speaker_theme_setting import SpeakerThemeSetting
            self.speaker_theme_setting = SpeakerThemeSetting()

    # ── Theme & Settings Properties ───────────────────────────

    @property
    def speaker_settings(self) -> dict:
        if not self.speaker_theme_setting:
            return {
                "enabled": True,
                "window_required": True,
                "profile_settings": {
                    "enabled_methods": {"form": True, "template": True, "cv": True},
                    "template_url": None,
                    "template_filename": None
                },
                "terms_and_conditions": "",
                "faqs": [],
                "include_default_faqs": True,
                "branding": {
                    "theme_color": "#1A73E8",
                    "logo_url": None,
                    "banner_url": None,
                    "theme": "midnight",
                    "header_images": []
                }
            }
        base = {
            "enabled": self.speaker_theme_setting.enabled,
            "window_required": self.speaker_theme_setting.window_required,
            "profile_settings": self.speaker_theme_setting.profile_settings or {
                "enabled_methods": {"form": True, "template": True, "cv": True},
                "template_url": None,
                "template_filename": None
            },
            "terms_and_conditions": self.speaker_theme_setting.terms_and_conditions,
            "faqs": self.speaker_theme_setting.faqs,
            "include_default_faqs": self.speaker_theme_setting.include_default_faqs,
            "branding": {
                "theme_color": self.speaker_theme_setting.theme_color,
                "logo_url": self.speaker_theme_setting.logo_url,
                "banner_url": self.speaker_theme_setting.banner_url,
                "theme": self.speaker_theme_setting.theme,
                "header_images": self.speaker_theme_setting.header_images,
            }
        }
        if self.speaker_theme_setting.extra_settings:
            base.update(self.speaker_theme_setting.extra_settings)
        return base

    @speaker_settings.setter
    def speaker_settings(self, value: dict) -> None:
        if not self.speaker_theme_setting:
            from app.modules.speakers.models.speaker_theme_setting import SpeakerThemeSetting
            self.speaker_theme_setting = SpeakerThemeSetting()
        
        explicit_columns = {
            "enabled", "window_required", "profile_settings",
            "terms_and_conditions", "faqs", "include_default_faqs"
        }
        
        if self.speaker_theme_setting.extra_settings is None:
            self.speaker_theme_setting.extra_settings = {}
        extra = dict(self.speaker_theme_setting.extra_settings)
        
        for k, v in value.items():
            if k in explicit_columns:
                setattr(self.speaker_theme_setting, k, v)
            elif k == "branding" and isinstance(v, dict):
                branding = v or {}
                if "theme_color" in branding:
                    self.speaker_theme_setting.theme_color = branding["theme_color"]
                if "logo_url" in branding:
                    self.speaker_theme_setting.logo_url = branding["logo_url"]
                if "banner_url" in branding:
                    self.speaker_theme_setting.banner_url = branding["banner_url"]
                if "theme" in branding:
                    self.speaker_theme_setting.theme = branding["theme"]
                if "header_images" in branding:
                    self.speaker_theme_setting.header_images = branding["header_images"]
            elif k not in ("id", "event_id", "created_at", "updated_at"):
                extra[k] = v
        self.speaker_theme_setting.extra_settings = extra

    @property
    def registration_settings(self) -> dict:
        if not self.registration_theme_setting:
            return {
                "enabled": True,
                "registration_allowed": True,
                "participants_list_allowed": True,
                "payment_enabled": False,
                "active_gateway": "simulated",
                "stripe_credentials": {},
                "tier_cutoffs": {},
                "disabled_categories": [],
                "terms_and_conditions": "",
                "faqs": [],
                "include_default_faqs": True,
            }
        base = {
            "enabled": self.registration_theme_setting.enabled,
            "registration_allowed": self.registration_theme_setting.registration_allowed,
            "participants_list_allowed": self.registration_theme_setting.participants_list_allowed,
            "payment_enabled": self.registration_theme_setting.payment_enabled,
            "active_gateway": self.registration_theme_setting.active_gateway,
            "stripe_credentials": self.registration_theme_setting.stripe_credentials,
            "tier_cutoffs": self.registration_theme_setting.tier_cutoffs,
            "disabled_categories": self.registration_theme_setting.disabled_categories,
            "terms_and_conditions": self.registration_theme_setting.terms_and_conditions,
            "faqs": self.registration_theme_setting.faqs,
            "include_default_faqs": self.registration_theme_setting.include_default_faqs,
        }
        if self.registration_theme_setting.extra_settings:
            base.update(self.registration_theme_setting.extra_settings)
        return base

    @registration_settings.setter
    def registration_settings(self, value: dict) -> None:
        if not self.registration_theme_setting:
            from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
            self.registration_theme_setting = RegistrationThemeSetting()
        
        explicit_columns = {
            "enabled", "registration_allowed", "participants_list_allowed",
            "payment_enabled", "active_gateway", "stripe_credentials",
            "tier_cutoffs", "disabled_categories", "terms_and_conditions",
            "faqs", "include_default_faqs"
        }
        
        if self.registration_theme_setting.extra_settings is None:
            self.registration_theme_setting.extra_settings = {}
        extra = dict(self.registration_theme_setting.extra_settings)
        
        for k, v in value.items():
            if k in explicit_columns:
                setattr(self.registration_theme_setting, k, v)
            elif k not in ("id", "event_id", "created_at", "updated_at"):
                extra[k] = v
        self.registration_theme_setting.extra_settings = extra

    @property
    def branding_settings(self) -> dict:
        if not self.registration_theme_setting:
            return {
                "theme_color": "#1A73E8",
                "logo_url": None,
                "banner_url": None,
                "theme": "midnight",
                "header_images": [],
            }
        return {
            "theme_color": self.registration_theme_setting.theme_color,
            "logo_url": self.registration_theme_setting.logo_url,
            "banner_url": self.registration_theme_setting.banner_url,
            "theme": self.registration_theme_setting.theme,
            "header_images": self.registration_theme_setting.header_images,
        }

    @branding_settings.setter
    def branding_settings(self, value: dict) -> None:
        if not self.registration_theme_setting:
            from app.modules.registration.models.registration_theme_setting import RegistrationThemeSetting
            self.registration_theme_setting = RegistrationThemeSetting()
        if "theme_color" in value:
            self.registration_theme_setting.theme_color = value["theme_color"]
        if "logo_url" in value:
            self.registration_theme_setting.logo_url = value["logo_url"]
        if "banner_url" in value:
            self.registration_theme_setting.banner_url = value["banner_url"]
        if "theme" in value:
            self.registration_theme_setting.theme = value["theme"]
        if "header_images" in value:
            self.registration_theme_setting.header_images = value["header_images"]

    # ── Backward-compatibility properties ─────────────────────

    @property
    def speaker_mode_enabled(self) -> bool:
        return bool((self.speaker_settings or {}).get("enabled", True))

    @speaker_mode_enabled.setter
    def speaker_mode_enabled(self, value: bool) -> None:
        settings = dict(self.speaker_settings or {})
        settings["enabled"] = value
        self.speaker_settings = settings

    @property
    def speaker_window_required(self) -> bool:
        return bool((self.speaker_settings or {}).get("window_required", True))

    @speaker_window_required.setter
    def speaker_window_required(self, value: bool) -> None:
        settings = dict(self.speaker_settings or {})
        settings["window_required"] = value
        self.speaker_settings = settings

    @property
    def registration_mode_enabled(self) -> bool:
        return bool((self.registration_settings or {}).get("enabled", True))

    @registration_mode_enabled.setter
    def registration_mode_enabled(self, value: bool) -> None:
        settings = dict(self.registration_settings or {})
        settings["enabled"] = value
        self.registration_settings = settings

    @property
    def registration_allowed(self) -> bool:
        return bool((self.registration_settings or {}).get("registration_allowed", True))

    @registration_allowed.setter
    def registration_allowed(self, value: bool) -> None:
        settings = dict(self.registration_settings or {})
        settings["registration_allowed"] = value
        self.registration_settings = settings

    @property
    def participants_list_allowed(self) -> bool:
        return bool((self.registration_settings or {}).get("participants_list_allowed", True))

    @participants_list_allowed.setter
    def participants_list_allowed(self, value: bool) -> None:
        settings = dict(self.registration_settings or {})
        settings["participants_list_allowed"] = value
        self.registration_settings = settings

    @property
    def theme_color(self) -> str:
        return (self.branding_settings or {}).get("theme_color", "#1A73E8")

    @theme_color.setter
    def theme_color(self, value: str) -> None:
        settings = dict(self.branding_settings or {})
        settings["theme_color"] = value
        self.branding_settings = settings

    @property
    def logo_url(self) -> Optional[str]:
        return (self.branding_settings or {}).get("logo_url")

    @logo_url.setter
    def logo_url(self, value: Optional[str]) -> None:
        settings = dict(self.branding_settings or {})
        settings["logo_url"] = value
        self.branding_settings = settings

    @property
    def banner_url(self) -> Optional[str]:
        return (self.branding_settings or {}).get("banner_url")

    @banner_url.setter
    def banner_url(self, value: Optional[str]) -> None:
        settings = dict(self.branding_settings or {})
        settings["banner_url"] = value
        self.branding_settings = settings

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

    webhooks: Mapped[List["Webhook"]] = relationship(
        "Webhook", back_populates="event", cascade="all, delete-orphan"
    )
    presentation_bundles: Mapped[List["PresentationBundle"]] = relationship(
        "PresentationBundle", back_populates="event", cascade="all, delete-orphan"
    )
    announcements: Mapped[List["Announcement"]] = relationship(
        "Announcement", back_populates="event", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} short_code={self.short_code} status={self.status}>"
