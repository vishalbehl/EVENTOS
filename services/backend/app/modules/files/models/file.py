import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

class Asset(Base):
    __tablename__ = "assets"
    __table_args__ = {"schema": "content"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    processing_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="QUARANTINED", index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    versions: Mapped[List["AssetVersion"]] = relationship("AssetVersion", back_populates="asset", cascade="all, delete-orphan", order_by="AssetVersion.version_number.desc()")
    tags: Mapped[List["AssetTag"]] = relationship("AssetTag", back_populates="asset", cascade="all, delete-orphan")
    permissions: Mapped[List["AssetPermission"]] = relationship("AssetPermission", back_populates="asset", cascade="all, delete-orphan")
    virus_scans: Mapped[List["VirusScan"]] = relationship("VirusScan", back_populates="asset", cascade="all, delete-orphan")

class AssetVersion(Base):
    __tablename__ = "asset_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content.assets.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    asset: Mapped["Asset"] = relationship("Asset", back_populates="versions")

class AssetTag(Base):
    __tablename__ = "asset_tags"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content.assets.id", ondelete="CASCADE"), index=True)
    tag: Mapped[str] = mapped_column(String(100), nullable=False, index=True)

    # Relationships
    asset: Mapped["Asset"] = relationship("Asset", back_populates="tags")

class AssetPermission(Base):
    __tablename__ = "asset_permissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content.assets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"))
    permission_type: Mapped[str] = mapped_column(String(50), default="read") # read, write, admin

    # Relationships
    asset: Mapped["Asset"] = relationship("Asset", back_populates="permissions")

class StorageLocation(Base):
    __tablename__ = "storage_locations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False) # local, s3, gcs
    config: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

class UploadSession(Base):
    __tablename__ = "upload_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(50), default="initiated") # initiated, uploading, completed, failed
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class DurableUpload(Base):
    """Tenant-scoped upload state independent of any specific domain."""
    __tablename__ = "durable_uploads"
    __table_args__ = {"schema": "content"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), index=True)
    # May represent a speaker-token actor rather than an identity user.
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    object_key: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    storage_bucket: Mapped[str] = mapped_column(String(100), nullable=False, default="assets")
    original_filename: Mapped[str] = mapped_column(String(500), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum: Mapped[Optional[str]] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="created", index=True)
    # Keep the database default as well as the Python default so writers from
    # an older application image can omit this newly-added concurrency token.
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    processing_error: Mapped[Optional[str]] = mapped_column(Text)
    task_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

class VirusScan(Base):
    __tablename__ = "virus_scans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("content.assets.id", ondelete="CASCADE"), index=True)
    status: Mapped[str] = mapped_column(String(50), default="pending") # pending, clean, infected, error
    scan_result: Mapped[Optional[str]] = mapped_column(Text)
    scanned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    # Relationships
    asset: Mapped["Asset"] = relationship("Asset", back_populates="virus_scans")
