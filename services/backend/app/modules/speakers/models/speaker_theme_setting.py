import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import ForeignKey, String, Text, Boolean, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class SpeakerThemeSetting(Base):
    """
    Separate table storing theme, branding, terms, FAQ and profile builder configuration
    for the Event Speaker Portal.
    """
    __tablename__ = "speaker_theme_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    
    # Theme & Branding
    theme_color: Mapped[str] = mapped_column(String(20), nullable=False, default="#1A73E8")
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    banner_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    theme: Mapped[str] = mapped_column(String(50), nullable=False, default="midnight")
    header_images: Mapped[List[str]] = mapped_column(JSONB, nullable=False, default=list)
    
    # Custom Content (Seeded defaults)
    terms_and_conditions: Mapped[str] = mapped_column(Text, nullable=False, default="")
    faqs: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    include_default_faqs: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Mode/Feature settings
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    window_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    
    # Profile builder settings
    profile_settings: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    
    # Store dynamic/unmapped settings for backward compatibility
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

    # Relationship to Event
    event = relationship("Event", back_populates="speaker_theme_setting")

    def __repr__(self) -> str:
        return f"<SpeakerThemeSetting id={self.id} event_id={self.event_id}>"

from app.services.template_defaults import get_default_speaker_terms, get_default_speaker_faqs

DEFAULT_SPEAKER_TERMS = get_default_speaker_terms()
DEFAULT_SPEAKER_FAQS = get_default_speaker_faqs()

