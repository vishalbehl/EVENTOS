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
    from app.modules.agenda.models.room import AgendaRoom
    from app.modules.agenda.models.track import AgendaTrack
    from app.modules.agenda.models.session import AgendaSession
    from app.modules.agenda.models.agenda import MasterAgenda
    from app.modules.events.models.speaker import Speaker
    from app.modules.presentations.models.poster import Poster
    from app.modules.presentations.models.presentation_file import PresentationFile
    from app.modules.registration.models.import_job import ImportJob
    from app.modules.communications.models.email_campaign import EmailCampaign
    from app.modules.registration.models.portal_theme_setting import PortalThemeSetting

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
    # Optimistic concurrency token for shared event-settings edits.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    organization_location_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organization_locations.id", ondelete="SET NULL"),
        nullable=True,
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
    is_maintenance: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )
    is_read_only: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

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

    # ── Unified Portal Theme Settings Relationship ───────────────
    portal_theme_setting: Mapped[Optional["PortalThemeSetting"]] = relationship(
        "PortalThemeSetting", back_populates="event", uselist=False, lazy="joined", cascade="all, delete-orphan"
    )

    @property
    def registration_theme_setting(self) -> Optional["PortalThemeSetting"]:
        return self.portal_theme_setting

    @registration_theme_setting.setter
    def registration_theme_setting(self, value: Optional["PortalThemeSetting"]) -> None:
        self.portal_theme_setting = value

    @property
    def speaker_theme_setting(self) -> Optional["PortalThemeSetting"]:
        return self.portal_theme_setting

    @speaker_theme_setting.setter
    def speaker_theme_setting(self, value: Optional["PortalThemeSetting"]) -> None:
        self.portal_theme_setting = value

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
        if "portal_theme_setting" not in self.__dict__ and "registration_theme_setting" not in self.__dict__:
            from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
            self.portal_theme_setting = PortalThemeSetting()


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
            # The unified settings row also stores registration.enabled;
            # never use that column as the speaker-mode fallback.
            "enabled": (self.speaker_theme_setting.extra_settings or {}).get(
                "speaker_enabled", True
            ),
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
        if "enabled" in value:
            self.speaker_theme_setting.extra_settings["speaker_enabled"] = bool(value["enabled"])

    @property
    def registration_settings(self) -> dict:
        pts = self.portal_theme_setting
        if not pts:
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
                "theme_color": "#6366F1",
                "primary_color": "#6366F1",
                "secondary_color": "#A855F7",
                "theme_preset": "dark-luxury",
                "svg_pattern": "glow-wave",
                "dark_mode_default": True,
                "font_family": "Inter",
                "custom_css": "",
                "tagline": "",
                "hero_description": "",
                "stats": [],
                "use_dynamic_stats": True,
                "program_url": "",
                "speaker_guidelines_url": "",
                "presentation_template_url": "",
                "support_email": "support@eventos.io",
                "support_phone": "",
                "additional_contacts": [],
                "theme_config": {
                    "preset": "dark-luxury",
                    "primary_color": "#6366F1",
                    "secondary_color": "#A855F7",
                    "dark_mode_default": True,
                    "svg_pattern": "glow-wave",
                    "font_family": "Inter",
                    "custom_css": "",
                },
            }
        primary_color = pts.primary_color or pts.theme_color or "#6366F1"
        secondary_color = pts.secondary_color or "#A855F7"
        theme_preset = pts.theme_preset or "dark-luxury"
        svg_pattern = pts.svg_pattern or "glow-wave"
        dark_mode_default = pts.dark_mode_default if pts.dark_mode_default is not None else True
        font_family = pts.font_family or "Inter"
        custom_css = pts.custom_css or ""

        base = {}
        if pts.extra_settings and isinstance(pts.extra_settings, dict):
            base.update(pts.extra_settings)

        # Dedicated database columns strictly take precedence over extra_settings
        base.update({
            "enabled": (pts.extra_settings or {}).get("registration_enabled", pts.enabled),
            "registration_allowed": pts.registration_allowed,
            "participants_list_allowed": pts.participants_list_allowed,
            "payment_enabled": pts.payment_enabled,
            "active_gateway": pts.active_gateway,
            "stripe_credentials": pts.stripe_credentials,
            "tier_cutoffs": pts.tier_cutoffs,
            "disabled_categories": pts.disabled_categories,
            "terms_and_conditions": pts.terms_and_conditions,
            "faqs": pts.faqs,
            "include_default_faqs": pts.include_default_faqs,
            "theme_color": primary_color,
            "primary_color": primary_color,
            "secondary_color": secondary_color,
            "theme_preset": theme_preset,
            "svg_pattern": svg_pattern,
            "dark_mode_default": dark_mode_default,
            "font_family": font_family,
            "custom_css": custom_css,
            "tagline": pts.tagline or "",
            "hero_description": pts.hero_description or "",
            "stats": pts.stats or [],
            "use_dynamic_stats": pts.use_dynamic_stats if pts.use_dynamic_stats is not None else True,
            "program_url": pts.program_url or "",
            "speaker_guidelines_url": pts.speaker_guidelines_url or "",
            "presentation_template_url": pts.presentation_template_url or "",
            "support_email": pts.support_email or "support@eventos.io",
            "support_phone": pts.support_phone or "",
            "additional_contacts": pts.additional_contacts or [],
            "theme_config": {
                "preset": theme_preset,
                "primary_color": primary_color,
                "secondary_color": secondary_color,
                "dark_mode_default": dark_mode_default,
                "svg_pattern": svg_pattern,
                "font_family": font_family,
                "custom_css": custom_css,
            },
        })
        return base

    @registration_settings.setter
    def registration_settings(self, value: dict) -> None:
        if not self.portal_theme_setting:
            from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
            self.portal_theme_setting = PortalThemeSetting()
        
        pts = self.portal_theme_setting
        
        explicit_columns = {
            "enabled", "registration_allowed", "participants_list_allowed",
            "payment_enabled", "active_gateway", "stripe_credentials",
            "tier_cutoffs", "disabled_categories", "terms_and_conditions",
            "faqs", "include_default_faqs", "theme_color", "primary_color",
            "secondary_color", "theme_preset", "svg_pattern", "dark_mode_default",
            "font_family", "custom_css", "logo_url", "banner_url", "favicon_url",
            "theme", "header_images", "tagline", "hero_description", "stats",
            "use_dynamic_stats", "program_url", "speaker_guidelines_url",
            "presentation_template_url", "support_email", "support_phone",
            "additional_contacts", "window_required", "profile_settings"
        }
        
        if pts.extra_settings is None:
            pts.extra_settings = {}
        extra = dict(pts.extra_settings)
        
        # Clean any explicit column keys out of extra_settings
        for col_name in explicit_columns:
            extra.pop(col_name, None)
        extra.pop("theme_config", None)
        
        if "theme_config" in value and isinstance(value["theme_config"], dict):
            tc = value["theme_config"]
            if "primary_color" in tc and tc["primary_color"]:
                pts.primary_color = tc["primary_color"]
                pts.theme_color = tc["primary_color"]
            if "secondary_color" in tc and tc["secondary_color"]:
                pts.secondary_color = tc["secondary_color"]
            if "preset" in tc and tc["preset"]:
                pts.theme_preset = tc["preset"]
            if "svg_pattern" in tc and tc["svg_pattern"]:
                pts.svg_pattern = tc["svg_pattern"]
            if "dark_mode_default" in tc:
                pts.dark_mode_default = tc["dark_mode_default"]
            if "font_family" in tc:
                pts.font_family = tc["font_family"]
            if "custom_css" in tc:
                pts.custom_css = tc["custom_css"]

        for k, v in value.items():
            if k in explicit_columns:
                setattr(pts, k, v)
                if k == "primary_color" and v:
                    pts.theme_color = v
            elif k != "theme_config" and k not in ("id", "event_id", "created_at", "updated_at"):
                extra[k] = v
        pts.extra_settings = extra
        if "enabled" in value:
            pts.extra_settings["registration_enabled"] = bool(value["enabled"])

    @property
    def branding_settings(self) -> dict:
        pts = self.portal_theme_setting
        if not pts:
            return {
                "theme_color": "#6366F1",
                "primary_color": "#6366F1",
                "secondary_color": "#A855F7",
                "logo_url": None,
                "banner_url": None,
                "theme": "midnight",
                "header_images": [],
            }
        primary = pts.primary_color or pts.theme_color or "#6366F1"
        secondary = pts.secondary_color or "#A855F7"
        return {
            "theme_color": primary,
            "primary_color": primary,
            "secondary_color": secondary,
            "logo_url": pts.logo_url,
            "banner_url": pts.banner_url,
            "theme": pts.theme,
            "header_images": pts.header_images,
        }

    @branding_settings.setter
    def branding_settings(self, value: dict) -> None:
        if not self.portal_theme_setting:
            from app.modules.registration.models.portal_theme_setting import PortalThemeSetting
            self.portal_theme_setting = PortalThemeSetting()
        pts = self.portal_theme_setting
        if "theme_color" in value:
            pts.theme_color = value["theme_color"]
            pts.primary_color = value["theme_color"]
        if "primary_color" in value:
            pts.primary_color = value["primary_color"]
            pts.theme_color = value["primary_color"]
        if "secondary_color" in value:
            pts.secondary_color = value["secondary_color"]
        if "logo_url" in value:
            pts.logo_url = value["logo_url"]
        if "banner_url" in value:
            pts.banner_url = value["banner_url"]
        if "theme" in value:
            pts.theme = value["theme"]
        if "header_images" in value:
            pts.header_images = value["header_images"]

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

    @property
    def support_email(self) -> str:
        return (
            (self.registration_settings or {}).get("support_email")
            or (self.organizer_details or {}).get("email")
            or "support@eventos.io"
        )

    @property
    def support_phone(self) -> str:
        return (
            (self.registration_settings or {}).get("support_phone")
            or (self.organizer_details or {}).get("phone")
            or ""
        )

    @property
    def theme_color(self) -> Optional[str]:
        return (
            (self.branding_settings or {}).get("primary_color")
            or ((self.registration_settings or {}).get("theme_config") or {}).get("primary_color")
            or "#6366F1"
        )

    @theme_color.setter
    def theme_color(self, value: Optional[str]) -> None:
        branding = dict(self.branding_settings or {})
        branding["primary_color"] = value
        self.branding_settings = branding


    # ── Relationships ─────────────────────────────────────
    organization: Mapped["Organization"] = relationship(
        "Organization", back_populates="events"
    )
    creator: Mapped[Optional["User"]] = relationship(
        "User", foreign_keys=[created_by], back_populates="created_events"
    )
    rooms: Mapped[List["AgendaRoom"]] = relationship(
        "AgendaRoom", back_populates="event", cascade="all, delete-orphan"
    )
    tracks: Mapped[List["AgendaTrack"]] = relationship(
        "AgendaTrack", back_populates="event", cascade="all, delete-orphan"
    )
    sessions: Mapped[List["AgendaSession"]] = relationship(
        "AgendaSession", back_populates="event", cascade="all, delete-orphan"
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
    agendas: Mapped[List["MasterAgenda"]] = relationship(
        "MasterAgenda", back_populates="event", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Event id={self.id} short_code={self.short_code} status={self.status}>"
