import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class FeatureCatalog(Base):
    __tablename__ = "feature_catalog"
    __table_args__ = {"schema": "platform"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50), default="core")
    category_order: Mapped[int] = mapped_column(Integer, default=0)
    feature_order: Mapped[int] = mapped_column(Integer, default=0)
    
    is_addon: Mapped[bool] = mapped_column(Boolean, default=False)
    is_billable: Mapped[bool] = mapped_column(Boolean, default=False)
    required_plan: Mapped[Optional[str]] = mapped_column(String(50))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    display_value_basic: Mapped[Optional[str]] = mapped_column(String(200))
    display_value_professional: Mapped[Optional[str]] = mapped_column(String(200))
    display_value_enterprise: Mapped[Optional[str]] = mapped_column(String(200))
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    @property
    def display_by_plan(self) -> dict:
        return {
            "BASIC": self.display_value_basic or "",
            "PROFESSIONAL": self.display_value_professional or "",
            "ENTERPRISE": self.display_value_enterprise or ""
        }

