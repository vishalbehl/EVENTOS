from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class HardwareCategory(Base):
    __tablename__ = "hardware_categories"
    __table_args__ = {"schema": "inventory"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class HardwareItem(Base):
    __tablename__ = "hardware_items"
    __table_args__ = (UniqueConstraint("asset_code"), {"schema": "inventory"})

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    category_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inventory.hardware_categories.id"), nullable=False)
    asset_code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    brand: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    model: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    serial_number: Mapped[str] = mapped_column(String(100), nullable=False, default="")
    purchase_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    purchase_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    renting_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    pricing_unit: Mapped[str] = mapped_column(String(30), nullable=False, default="PER_EVENT")
    description: Mapped[str | None] = mapped_column(Text)
    tax_category: Mapped[str | None] = mapped_column(String(50))
    replacement_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="AVAILABLE", index=True)
    condition: Mapped[str] = mapped_column(String(50), nullable=False, default="GOOD")
    location: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)


class HardwareStock(Base):
    __tablename__ = "hardware_stock"
    __table_args__ = {"schema": "inventory"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    hardware_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inventory.hardware_items.id"), nullable=False, index=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    reserved_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    available_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
