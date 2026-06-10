import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, ForeignKey, Text, Integer, JSON
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class AppRegistry(Base):
    __tablename__ = "apps"
    __table_args__ = {"schema": "applications"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    app_type: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. web, mobile, kiosk
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE")
    visibility: Mapped[str] = mapped_column(String(50), default="PUBLIC")
    version: Mapped[str] = mapped_column(String(50), default="1.0.0")
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)
    is_billable: Mapped[bool] = mapped_column(Boolean, default=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class AppVersion(Base):
    __tablename__ = "app_versions"
    __table_args__ = {"schema": "applications"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    app_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.apps.id", ondelete="CASCADE"))
    version: Mapped[str] = mapped_column(String(50), nullable=False)
    release_notes: Mapped[Optional[str]] = mapped_column(Text)
    released_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class OrganizationApp(Base):
    __tablename__ = "organization_apps"
    __table_args__ = {"schema": "applications"}

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True)
    app_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.apps.id", ondelete="CASCADE"), primary_key=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    configured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class MobileConfiguration(Base):
    __tablename__ = "mobile_configurations"
    __table_args__ = {"schema": "applications"}

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True)
    app_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("applications.apps.id", ondelete="CASCADE"), primary_key=True)
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)
