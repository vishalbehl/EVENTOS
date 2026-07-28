import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from sqlalchemy import String, Boolean, DateTime, Text, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class FeatureCatalog(Base):
    __tablename__ = "feature_catalog"
    __table_args__ = {"schema": "billing"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(50), default="core")
    scope_type: Mapped[str] = mapped_column(String(30), default="ORG_SCOPED", nullable=False)
    value_type: Mapped[str] = mapped_column(String(20), default="BOOLEAN", nullable=False)
    default_value: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    allowed_values: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    period: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    enforcement_mode: Mapped[str] = mapped_column(String(30), default="HARD", nullable=False)
    portal_routes: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    backend_operations: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    required_permissions: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    metric_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    dependencies: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    conflicts: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    owner_console: Mapped[str] = mapped_column(String(30), default="BUSINESS", nullable=False)
    owner_team: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20), default="MEDIUM", nullable=False)
    lifecycle_status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    replacement_key: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    category_order: Mapped[int] = mapped_column(Integer, default=0)
    feature_order: Mapped[int] = mapped_column(Integer, default=0)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
