import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

class TemplateCategory(Base):
    __tablename__ = "template_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

class RoomTemplate(Base, SoftDeleteMixin):
    __tablename__ = "room_templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    # Specs
    default_capacity: Mapped[int] = mapped_column(Integer, default=150)
    room_type: Mapped[str] = mapped_column(String(100), default="Conference Room")
    setup_time: Mapped[float] = mapped_column(Numeric(10, 2), default=2.00)
    teardown_time: Mapped[float] = mapped_column(Numeric(10, 2), default=1.00)

    # Allocations
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class RegistrationTemplate(Base, SoftDeleteMixin):
    __tablename__ = "registration_templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    # Specs
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

    # Allocations
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class SrrTemplate(Base, SoftDeleteMixin):
    __tablename__ = "srr_templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    # Specs
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

    # Allocations
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class NetworkTemplate(Base, SoftDeleteMixin):
    __tablename__ = "network_templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    # Specs
    venue_capacity: Mapped[str] = mapped_column(String(100), default="500-2000")
    internet_links: Mapped[int] = mapped_column(Integer, default=2)
    network_capacity: Mapped[str] = mapped_column(String(100), default="1 Gbps")
    isp_type: Mapped[str] = mapped_column(String(100), default="Dual Fiber Active-Passive")
    primary_router: Mapped[str] = mapped_column(String(100), default="Cisco Catalyst 8300")
    backup_router: Mapped[str] = mapped_column(String(100), default="Cisco Catalyst 8200")
    firewall: Mapped[str] = mapped_column(String(100), default="FortiGate 100F")
    core_switches: Mapped[int] = mapped_column(Integer, default=1)
    dist_switches: Mapped[int] = mapped_column(Integer, default=2)
    access_switches: Mapped[int] = mapped_column(Integer, default=4)
    access_points: Mapped[int] = mapped_column(Integer, default=12)
    controllers: Mapped[str] = mapped_column(String(100), default="Cloud Controller")
    reg_vlan: Mapped[str] = mapped_column(String(255), default="")
    srr_vlan: Mapped[str] = mapped_column(String(255), default="")
    org_vlan: Mapped[str] = mapped_column(String(255), default="")
    prod_vlan: Mapped[str] = mapped_column(String(255), default="")
    guest_wifi: Mapped[str] = mapped_column(String(255), default="")
    exhibitor_network: Mapped[str] = mapped_column(String(255), default="")
    streaming_network: Mapped[str] = mapped_column(String(255), default="")
    monitoring_tool: Mapped[str] = mapped_column(String(100), default="Zabbix / Grafana")
    alerts: Mapped[str] = mapped_column(String(100), default="Slack + SMS Notifications")
    logging: Mapped[str] = mapped_column(String(100), default="Syslog Server")
    redundancy: Mapped[str] = mapped_column(String(100), default="High (Dual ISP + Dual Router)")
    failover_time: Mapped[str] = mapped_column(String(100), default="< 3 seconds")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
