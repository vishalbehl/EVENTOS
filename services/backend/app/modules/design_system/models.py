import uuid
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class DesignToken(Base):
    __tablename__ = "design_tokens"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False) # COLOR, FONT, SPACING, RADIUS, SHADOW, etc.
    value: Mapped[str] = mapped_column(String(255), nullable=False)

class ThemePreset(Base):
    __tablename__ = "theme_presets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    settings: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

class ComponentLibrary(Base):
    __tablename__ = "component_library"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    component_name: Mapped[str] = mapped_column(String(100), nullable=False)
    component_type: Mapped[str] = mapped_column(String(50), nullable=False) # TEXT, BUTTON, COUNTDOWN, AGENDA, etc.
    schema: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
