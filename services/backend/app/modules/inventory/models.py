import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Numeric, Date
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class HardwareCategory(Base):
    __tablename__ = "hardware_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class HardwareItem(Base):
    __tablename__ = "hardware_items"
    __table_args__ = (
        Index("idx_hardware_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inventory.hardware_categories.id", ondelete="RESTRICT"), nullable=False)
    asset_code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    brand: Mapped[str] = mapped_column(String(100), nullable=False)
    model: Mapped[str] = mapped_column(String(100), nullable=False)
    purchase_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    renting_price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="AVAILABLE") # AVAILABLE, ALLOCATED, MAINTENANCE, RETIRED, LOST
    pricing_unit: Mapped[str] = mapped_column(String(50), default="PER_EVENT")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tax_category: Mapped[str] = mapped_column(String(50), default="GST_18")

    @property
    def location(self) -> Optional[str]:
        return getattr(self, "_transient_location", None)

    @location.setter
    def location(self, value: Optional[str]) -> None:
        self._transient_location = value

    @property
    def condition(self) -> Optional[str]:
        return getattr(self, "_transient_condition", None)

    @condition.setter
    def condition(self, value: Optional[str]) -> None:
        self._transient_condition = value


class HardwareStock(Base):
    __tablename__ = "hardware_stock"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hardware_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inventory.hardware_items.id", ondelete="CASCADE"), nullable=False)
    quantity: Mapped[int] = mapped_column(default=0)
    reserved_quantity: Mapped[int] = mapped_column(default=0)
    available_quantity: Mapped[int] = mapped_column(default=0)


class HardwareMovement(Base):
    __tablename__ = "hardware_movements"
    __table_args__ = (
        Index("idx_hardware_movements_org", "organization_id"),
        {"postgresql_partition_by": "RANGE (created_at)"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    hardware_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inventory.hardware_items.id", ondelete="CASCADE"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False) # Purchase, Assignment, Return, Transfer, Damage, Retirement
    quantity: Mapped[int] = mapped_column(default=1)
    from_location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    to_location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        primary_key=True, 
        default=lambda: datetime.now(timezone.utc), 
        index=True
    )


class HardwareMaintenance(Base):
    __tablename__ = "hardware_maintenance"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hardware_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inventory.hardware_items.id", ondelete="CASCADE"), nullable=False)
    maintenance_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    vendor: Mapped[str] = mapped_column(String(150), nullable=False)
    cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
