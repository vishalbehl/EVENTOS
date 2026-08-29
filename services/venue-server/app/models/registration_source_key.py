import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class RegistrationSourceApiKey(Base):
    """Event-scoped key that allows Registration Server to fetch from this source."""

    __tablename__ = "registration_source_api_keys"
    __table_args__ = (
        UniqueConstraint("key_hash", name="uq_registration_source_api_keys_hash"),
        {"schema": "venue"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    key_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    allowed_app: Mapped[str] = mapped_column(String(50), nullable=False, default="registration")
    permissions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: {"read": True, "push": True})
    scopes: Mapped[list] = mapped_column(JSONB, nullable=False, default=lambda: [
        "registration:snapshot:read",
        "registration:delta:read",
        "registration:heartbeat:write",
        "registration:operations:write",
    ])
    allowed_cidrs: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    rotation_of_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    grace_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_ip: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    usage_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class RegistrationSourceKeyUsage(Base):
    __tablename__ = "registration_source_key_usage"
    __table_args__ = ({"schema": "venue"},)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    endpoint: Mapped[str] = mapped_column(String(240), nullable=False)
    source_ip: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    result: Mapped[str] = mapped_column(String(30), nullable=False)
    cursor: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


class RegistrationSourceHeartbeat(Base):
    __tablename__ = "registration_source_heartbeats"
    __table_args__ = (UniqueConstraint("key_id", name="uq_registration_source_heartbeat_key"), {"schema": "venue"})

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False, index=True)
    server_name: Mapped[str] = mapped_column(String(160), nullable=False)
    version: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    queue_depth: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_applied_cursor: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    metrics: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    source_ip: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)
