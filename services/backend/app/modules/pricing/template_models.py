import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base, SoftDeleteMixin


class RoomTemplate(Base, SoftDeleteMixin):
    __tablename__ = "room_templates"
    __table_args__ = {"schema": "operation_templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    short_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    consumables_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    inclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    default_capacity: Mapped[int] = mapped_column(Integer, default=150)
    room_type: Mapped[str] = mapped_column(String(100), default="Conference Room")
    podiums: Mapped[int] = mapped_column(Integer, default=0)
    setup_time: Mapped[float] = mapped_column(Numeric(10, 2), default=2.00)
    teardown_time: Mapped[float] = mapped_column(Numeric(10, 2), default=1.00)
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class RegistrationTemplate(Base, SoftDeleteMixin):
    __tablename__ = "registration_templates"
    __table_args__ = {"schema": "operation_templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    short_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    consumables_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    inclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    registration_type: Mapped[str] = mapped_column(String(100), default="Onsite")
    min_attendees: Mapped[int] = mapped_column(Integer, default=1000)
    max_attendees: Mapped[int] = mapped_column(Integer, default=3000)
    recommended_reg_type: Mapped[str] = mapped_column(String(100), default="Conference")
    reg_counters: Mapped[int] = mapped_column(Integer, default=8)
    kiosks: Mapped[int] = mapped_column(Integer, default=4)
    badge_stations: Mapped[int] = mapped_column(Integer, default=4)
    qr_stations: Mapped[int] = mapped_column(Integer, default=8)
    helpdesk_counters: Mapped[int] = mapped_column(Integer, default=2)
    checkins_per_hour: Mapped[int] = mapped_column(Integer, default=600)
    badge_per_piece_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=15.00)
    setup_time: Mapped[float] = mapped_column(Numeric(10, 2), default=2.00)
    teardown_time: Mapped[float] = mapped_column(Numeric(10, 2), default=1.00)
    is_single_kiosk: Mapped[bool] = mapped_column(Boolean, default=False)
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )


class SrrTemplate(Base, SoftDeleteMixin):
    __tablename__ = "srr_templates"
    __table_args__ = {"schema": "operation_templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    short_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    consumables_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    inclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    srr_type: Mapped[str] = mapped_column(String(100), default="Large")
    min_speakers: Mapped[int] = mapped_column(Integer, default=150)
    max_speakers: Mapped[int] = mapped_column(Integer, default=350)
    recommended_event_size: Mapped[str] = mapped_column(String(100), default="Large")
    preview_stations: Mapped[int] = mapped_column(Integer, default=16)
    checkin_counters: Mapped[int] = mapped_column(Integer, default=2)
    is_single_station: Mapped[bool] = mapped_column(Boolean, default=False)
    consultation_desks: Mapped[int] = mapped_column(Integer, default=1)
    printer_stations: Mapped[int] = mapped_column(Integer, default=1)
    speakers_per_hour: Mapped[int] = mapped_column(Integer, default=60)
    setup_time: Mapped[float] = mapped_column(Numeric(10, 2), default=3.00)
    teardown_time: Mapped[float] = mapped_column(Numeric(10, 2), default=2.00)
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
