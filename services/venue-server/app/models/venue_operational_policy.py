from sqlalchemy import Column, String, Boolean, Integer, DateTime, JSON
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime, timezone
import uuid
from app.database import Base


class VenueOperationalPolicy(Base):
    __tablename__ = "venue_operational_policies"
    __table_args__ = {"schema": "venue"}

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id = Column(UUID(as_uuid=True), nullable=True)

    # 1. Payment Guardrails (Lists of authorized payment statuses, default ["All"])
    allowed_payment_statuses_for_checkin = Column(JSON, default=lambda: ["All"], nullable=False)
    allowed_payment_statuses_for_print = Column(JSON, default=lambda: ["All"], nullable=False)
    allowed_payment_statuses_for_self_checkin = Column(JSON, default=lambda: ["All"], nullable=False)

    # Legacy booleans kept for backward-compatibility
    require_paid_for_checkin = Column(Boolean, default=False, nullable=False)
    require_paid_for_print = Column(Boolean, default=False, nullable=False)
    require_paid_for_self_checkin = Column(Boolean, default=False, nullable=False)

    # 2. Check-in Prerequisite Guardrails
    require_checkin_for_print = Column(Boolean, default=True, nullable=False)
    require_checkin_for_kit = Column(Boolean, default=True, nullable=False)
    require_primary_checkin_for_companions = Column(Boolean, default=True, nullable=False)

    # 3. Badge Printing & Kiosk Limits
    max_badge_reprints = Column(Integer, default=1, nullable=False)
    allow_self_checkin_reprints = Column(Boolean, default=True, nullable=False)
    max_self_checkin_reprints = Column(Integer, default=1, nullable=False)
    allow_self_checkin_profile_edit = Column(Boolean, default=True, nullable=False)

    # 4. Logistics & Security
    limit_single_kit_per_delegate = Column(Boolean, default=True, nullable=False)
    max_companions_per_delegate = Column(Integer, default=2, nullable=False)
    allow_admin_override = Column(Boolean, default=True, nullable=False)

    # Metadata & Custom rules
    custom_rules = Column(JSON, default=dict, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    updated_by = Column(String, default="admin")
