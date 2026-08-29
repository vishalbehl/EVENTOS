import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class EventSetting(Base):
    """
    Event-level key-value settings.
    """
    __tablename__ = "event_settings"
    __table_args__ = {"schema": "events"}

    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        primary_key=True
    )
    settings: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )


class EventAsset(Base):
    """
    Event branding and file assets.
    """
    __tablename__ = "event_assets"
    __table_args__ = {"schema": "events"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        index=True
    )
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False) # banner, logo, custom_pdf
    url: Mapped[str] = mapped_column(Text, nullable=False)
