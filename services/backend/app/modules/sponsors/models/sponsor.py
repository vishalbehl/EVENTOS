import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class Sponsor(Base):
    __tablename__ = "sponsors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    tier: Mapped[str] = mapped_column(String(50), nullable=False, default="bronze") # gold, silver, bronze
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SponsorContact(Base):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sponsor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sponsors.sponsors.id", ondelete="CASCADE"), index=True)
    first_name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)

class SponsorPackage(Base):
    __tablename__ = "packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[float] = mapped_column(Numeric(10, 2), default=0.0)

class SponsorBooth(Base):
    __tablename__ = "booths"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sponsor_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("sponsors.sponsors.id", ondelete="SET NULL"), index=True)
    location: Mapped[str] = mapped_column(String(100), nullable=False)
    size: Mapped[Optional[str]] = mapped_column(String(50))

class SponsorDeliverable(Base):
    __tablename__ = "deliverables"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sponsor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sponsors.sponsors.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)

class SponsorInvoice(Base):
    __tablename__ = "invoices"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sponsor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sponsors.sponsors.id", ondelete="CASCADE"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="unpaid") # paid, unpaid, overdue
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class SponsorAsset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sponsor_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("sponsors.sponsors.id", ondelete="CASCADE"), index=True)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False) # logo, banner, video
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
