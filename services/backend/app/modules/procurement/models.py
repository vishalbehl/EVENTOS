import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, Numeric, Float
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Vendor(Base):
    __tablename__ = "vendors"
    __table_args__ = (
        Index("idx_vendor_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False) # hardware, services, catering
    country: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    contact_person: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    email: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    gst_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    rating: Mapped[float] = mapped_column(Float, default=5.0)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE") # ACTIVE, INACTIVE


class VendorService(Base):
    __tablename__ = "vendor_services"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    vendor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("procurement.vendors.id", ondelete="CASCADE"), nullable=False)
    service_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("commercial.services.id", ondelete="CASCADE"), nullable=False)
    cost: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
