import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, ForeignKey, Boolean, Integer, DateTime
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class EventBlueprint(Base):
    __tablename__ = "event_blueprints"
    __table_args__ = {"schema": "blueprints"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    industry: Mapped[str] = mapped_column(String(100), index=True) # Medical, Technology, etc.
    blueprint_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

class BlueprintTemplate(Base):
    __tablename__ = "blueprint_templates"
    __table_args__ = {"schema": "blueprints"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blueprint_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("blueprints.event_blueprints.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))

class BlueprintInstallation(Base):
    __tablename__ = "blueprint_installations"
    __table_args__ = {"schema": "blueprints"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), index=True)
    blueprint_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("blueprints.event_blueprints.id", ondelete="CASCADE"))
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class BlueprintStep(Base):
    __tablename__ = "blueprint_steps"
    __table_args__ = {"schema": "blueprints"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    blueprint_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("blueprints.event_blueprints.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    step_order: Mapped[int] = mapped_column(Integer, default=0)
    settings: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
