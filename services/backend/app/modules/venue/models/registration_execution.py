import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import INET, MACADDR, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, synonym

from app.database import Base
from app.modules.platform.models.organization import Organization as RegistrationVenueOrganization


class RegistrationVenueUser(Base):
    __tablename__ = "venue_users"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    username: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(150), nullable=False, default="Venue")
    last_name: Mapped[str] = mapped_column(String(150), nullable=False, default="Administrator")
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="admin", index=True)
    allowed_modes: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: ["admin"])
    mode_preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    notification_preferences: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RegistrationCompanion(Base):
    __tablename__ = "companions"
    __table_args__ = {"schema": "registration", "extend_existing": True}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    primary_participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    first_name: Mapped[str] = mapped_column(String(150), nullable=False)
    last_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    relationship: Mapped[str] = mapped_column(String(50), nullable=False, default="Spouse")
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    badge_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    badge_status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending")
    checked_in: Mapped[bool] = mapped_column(default=False)
    checked_in_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    dietary_preference: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    special_assistance: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


from app.modules.registration.models.participant_role import ParticipantRole as RegistrationParticipantRole


class RegistrationParticipantRegistration(Base):
    __tablename__ = "participant_registrations"
    __table_args__ = {"schema": "registration"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    registration_status: Mapped[str] = mapped_column(String(50), nullable=False, default="submitted")
    registration_data: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    reviewed_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    waitlist_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    approval_source: Mapped[str] = mapped_column(String(50), nullable=False, default="portal")


class RegistrationParticipantExtension(Base):
    __tablename__ = "participant_extensions"
    __table_args__ = {"schema": "registration"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    department: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    dietary_preference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Vegetarian")
    emergency_contact: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    custom_attributes: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class RegistrationRoomDevice(Base):
    __tablename__ = "room_devices"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    device_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    device_name: Mapped[str] = mapped_column(String(100), nullable=False)
    hostname: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    mac_address: Mapped[Optional[str]] = mapped_column(MACADDR, nullable=True)
    os_version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    app_version: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="offline", index=True)
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    registered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class VenueCheckInGate(Base):
    __tablename__ = "venue_checkin_gates"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gate_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gate_type: Mapped[str] = mapped_column(String(100), nullable=False, default="Room")
    allowed_roles: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: ["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"])
    max_checkins_per_delegate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    gate_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    updated_by: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    updated_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    station_name = synonym("gate_name")
    station_type = synonym("gate_type")
    station_capacity = synonym("gate_capacity")


from app.modules.registration.models.badge_models import (
    Badge as VenueExecutionBadge,
    BadgeHistory as VenueExecutionBadgeHistory,
)


class VenueExecutionBadgePrintJob(Base):
    __tablename__ = "badge_print_jobs"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    badge_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("venue.badges.id", ondelete="CASCADE"), nullable=False, index=True)
    printer_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("venue.printers.id", ondelete="SET NULL"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="queued")
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class VenueScanEvent(Base):
    __tablename__ = "venue_scan_events"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    companion_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    checkin_gate_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    badge_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    station_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Main Gate")
    station_type: Mapped[str] = mapped_column(String(100), nullable=False, default="Room")
    location: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    badge_code: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    scan_type: Mapped[str] = mapped_column(String(50), nullable=False, default="check_in")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="success")
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_overridden_by: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    station_id = synonym("checkin_gate_id")


class VenueCheckIn(Base):
    __tablename__ = "venue_checkins"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    participant_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    companion_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    checkin_gate_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    gate_name: Mapped[str] = mapped_column(String(255), nullable=False, default="Initial Participant Check-In Gate")
    gate_type: Mapped[str] = mapped_column(String(100), nullable=False, default="Main Entrance Intake")
    gate_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=5000)
    badge_code: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    scan_type: Mapped[str] = mapped_column(String(50), nullable=False, default="check_in")
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="success")
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    admin_overridden_by: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    checkin_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    checkout_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    duration: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    method: Mapped[str] = mapped_column(String(50), nullable=False, default="qr")
    device_id: Mapped[str] = mapped_column(String(100), nullable=False, default="unknown")
    operation_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    station_id = synonym("checkin_gate_id")
    capacity_rule_id = synonym("checkin_gate_id")
    station_name = synonym("gate_name")
    station_type = synonym("gate_type")
    station_capacity = synonym("gate_capacity")


class VenueNodeAssignment(Base):
    __tablename__ = "node_assignments"
    __table_args__ = (
        UniqueConstraint("event_id", "device_id", name="uq_venue_node_event_device"),
        {"schema": "venue"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    device_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(30), nullable=False, default="registration")
    station_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    checkin_gate_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="pending", index=True)
    snapshot_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_heartbeat_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    capacity_rule_id = synonym("checkin_gate_id")


class VenueNodeOperation(Base):
    __tablename__ = "node_operations"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    operation_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True, index=True)
    assignment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(60), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="received", index=True)
    conflict_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class VenueKit(Base):
    __tablename__ = "kits"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kit_name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="Delegate")
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    distributed_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_per_participant: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    target_roles: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: ["All"])
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class VenueParticipantKit(Base):
    __tablename__ = "participant_kits"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    kit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Issued")
    issued_by: Mapped[str] = mapped_column(String(100), nullable=False, default="REG-DESK-01")
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class VenueSyncOutbox(Base):
    __tablename__ = "sync_outbox"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(30), nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class VenueParticipantActionLog(Base):
    __tablename__ = "participant_action_logs"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    participant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    action_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    performed_by: Mapped[str] = mapped_column(String(100), nullable=False, default="REG-DESK-01")
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class VenueNetworkConfiguration(Base):
    __tablename__ = "network_configurations"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    active_adapter_name: Mapped[str] = mapped_column(String(100), nullable=False)
    adapter_description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    media_type: Mapped[str] = mapped_column(String(30), default="Ethernet")
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    subnet: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gateway: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    mac_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class VenueEventReportSnapshot(Base):
    __tablename__ = "event_report_snapshots"
    __table_args__ = (
        UniqueConstraint("event_id", "version", name="uq_event_report_snapshot_version"),
        {"schema": "venue"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    report_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    supersedes_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    revision_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class VenueEventReportAudit(Base):
    __tablename__ = "event_report_audit"
    __table_args__ = {"schema": "venue"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    snapshot_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    export_format: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    data_scope: Mapped[str] = mapped_column(String(50), nullable=False, default="full_pii")
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
