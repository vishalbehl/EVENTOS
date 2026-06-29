import uuid
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (
        Index("idx_service_category", "category_id"),
        Index("idx_service_code", "service_code"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("commercial.service_categories.id", ondelete="RESTRICT"), nullable=False)
    service_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    service_name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    unit_type: Mapped[str] = mapped_column(String(50), default="flat") # flat, hourly, daily, item
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    is_internal: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class ServiceFeature(Base):
    __tablename__ = "service_features"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("commercial.services.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class ServicePackage(Base):
    __tablename__ = "service_packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    package_name: Mapped[str] = mapped_column(String(150), nullable=False)
    package_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Numeric(12, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class PackageService(Base):
    __tablename__ = "package_services"

    package_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("commercial.service_packages.id", ondelete="CASCADE"), primary_key=True)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("commercial.services.id", ondelete="CASCADE"), primary_key=True)
    quantity: Mapped[int] = mapped_column(default=1)


class StaffRole(Base):
    __tablename__ = "staff_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    role_code: Mapped[str] = mapped_column(String(50), nullable=False, default="OPS-ROLE")
    role_name: Mapped[str] = mapped_column(String(150), unique=True, nullable=False)
    team_category: Mapped[str] = mapped_column(String(100), nullable=False, default="General Operations")
    grade: Mapped[str] = mapped_column(String(50), nullable=False, default="L1")
    cost_per_day: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0.0)
    selling_per_day: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0.0)
    available_count: Mapped[int] = mapped_column(default=10)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="ACTIVE")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


