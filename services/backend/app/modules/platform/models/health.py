import uuid
from datetime import datetime, timezone
from typing import List
from sqlalchemy import String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class OrganizationHealth(Base):
    __tablename__ = "organization_health"

    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), primary_key=True)
    health_score: Mapped[int] = mapped_column(Integer, default=100) # 0 to 100
    status: Mapped[str] = mapped_column(String(50), default="HEALTHY") # HEALTHY, WARNING, CRITICAL
    warnings: Mapped[List[str]] = mapped_column(JSONB, default=list)
    last_calculated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
