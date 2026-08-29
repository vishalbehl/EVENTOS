import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import ForeignKey, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates
from app.database import Base


class PortalThemeSetting(Base):
    """
    Unified table storing visual design, theme colors, SVG patterns, branding,
    content, guidelines, support contacts, and payment configuration for all Event Portals.
    """
    __tablename__ = "portal_theme_settings"
    __table_args__ = {"schema": "design"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # ── Visual Theming & Color Palette ────────────────────────
    theme_color: Mapped[str] = mapped_column(String(50), nullable=False, default="#6366F1")
    primary_color: Mapped[str] = mapped_column(String(50), nullable=False, default="#6366F1")
    secondary_color: Mapped[str] = mapped_column(String(50), nullable=False, default="#8B5CF6")
    theme_preset: Mapped[str] = mapped_column(String(50), nullable=False, default="dark-luxury")
    svg_pattern: Mapped[str] = mapped_column(String(50), nullable=False, default="glow-wave")
    dark_mode_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    font_family: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Inter")
    custom_css: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # ── Branding & Media ──────────────────────────────────────
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    banner_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    favicon_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    theme: Mapped[str] = mapped_column(String(50), nullable=False, default="midnight")
    header_images: Mapped[List[str]] = mapped_column(JSONB, nullable=False, default=list)

    # ── Hero Copy & Live Content ──────────────────────────────
    tagline: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    hero_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stats: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    use_dynamic_stats: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    terms_and_conditions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    faqs: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    include_default_faqs: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # ── Materials & Document Downloads ────────────────────────
    program_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    speaker_guidelines_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    presentation_template_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # ── Multi-Channel Support & Contacts ──────────────────────
    support_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    support_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    additional_contacts: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)

    # ── Functional Mode & Registration Permissions ────────────
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    registration_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    participants_list_allowed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    window_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    profile_settings: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

    # ── Payments & Financial Controls ─────────────────────────
    payment_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    active_gateway: Mapped[str] = mapped_column(String(50), nullable=False, default="simulated")
    stripe_credentials: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    encrypted_stripe_credentials: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tier_cutoffs: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    disabled_categories: Mapped[List[str]] = mapped_column(JSONB, nullable=False, default=list)

    # ── Dynamic / Unmapped Configuration ──────────────────────
    extra_settings: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)

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

    # ── Relationships ─────────────────────────────────────────
    event = relationship("Event", back_populates="portal_theme_setting")

    @validates("stripe_credentials")
    def validate_stripe_credentials(self, key: str, value: Any) -> Any:
        if isinstance(value, dict):
            secret_key = value.get("secret_key")
            if secret_key and secret_key.startswith("sk_"):
                raise ValueError("Plaintext secret keys (sk_) are not allowed to be stored in the database.")
        return value

    def __repr__(self) -> str:
        return f"<PortalThemeSetting id={self.id} event_id={self.event_id}>"


# Compatibility Alias
RegistrationThemeSetting = PortalThemeSetting
