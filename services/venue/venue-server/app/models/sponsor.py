import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event


class Sponsor(Base):
    """
    Conference Sponsor. Belongs to an event.
    """
    __table_args__ = {"schema": "events"}
    __tablename__ = "sponsors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    tier: Mapped[str] = mapped_column(String(50), nullable=False, default="bronze")  # platinum, gold, silver, bronze
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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

    # Relationships
    event: Mapped["Event"] = relationship("Event")
    booths: Mapped[List["SponsorBooth"]] = relationship(
        "SponsorBooth", back_populates="sponsor", cascade="all, delete-orphan"
    )
    assets: Mapped[List["SponsorAsset"]] = relationship(
        "SponsorAsset", back_populates="sponsor", cascade="all, delete-orphan"
    )


class SponsorBooth(Base):
    """
    Exhibition booth assigned to a sponsor.
    """
    __table_args__ = {"schema": "events"}
    __tablename__ = "sponsor_booths"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sponsor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.sponsors.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    location: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    sponsor: Mapped[Optional["Sponsor"]] = relationship("Sponsor", back_populates="booths")


class SponsorAsset(Base):
    """
    Media assets (logos, banners, promo videos) for digital signage & display kiosks.
    """
    __table_args__ = {"schema": "events"}
    __tablename__ = "sponsor_assets"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    sponsor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.sponsors.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False)  # logo, banner, video, flyer
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    sponsor: Mapped["Sponsor"] = relationship("Sponsor", back_populates="assets")
