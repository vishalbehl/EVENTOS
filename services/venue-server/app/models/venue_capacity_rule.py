import uuid
from datetime import datetime, timezone
from typing import Optional, List

from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, synonym

from app.database import Base

class VenueCapacityRule(Base):
    """
    Dedicated venue capacity and station check-in rule model.
    Stored under PostgreSQL 'venue' schema.
    """
    __table_args__ = {"schema": "venue", "extend_existing": True}
    __tablename__ = "venue_checkin_gates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    gate_name: Mapped[str] = mapped_column(String(255), nullable=False)
    gate_type: Mapped[str] = mapped_column(String(100), nullable=False, default="Room")
    
    # JSONB array of permitted roles, e.g. ["Delegate", "Speaker", "VIP"]
    allowed_roles: Mapped[List[str]] = mapped_column(
        JSONB, nullable=False, default=lambda: ["Delegate", "Speaker", "VIP", "Exhibitor", "Media", "Sponsor"]
    )
    
    # Maximum allowed check-in entries per single delegate (0 = unlimited)
    max_checkins_per_delegate: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Physical room / station seating capacity
    gate_capacity: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    
    # Admin Override Audit Trail
    updated_by: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    updated_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc)
    )

    station_name = synonym("gate_name")
    station_type = synonym("gate_type")
    station_capacity = synonym("gate_capacity")
