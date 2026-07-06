import uuid
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base

class Theme(Base):
    __tablename__ = "themes"
    __table_args__ = {"schema": "theme_engine"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    theme_data: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)

class ThemeAsset(Base):
    __tablename__ = "theme_assets"
    __table_args__ = {"schema": "theme_engine"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    theme_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("theme_engine.themes.id", ondelete="CASCADE"), index=True)
    asset_url: Mapped[str] = mapped_column(String(512), nullable=False)
    asset_type: Mapped[str] = mapped_column(String(50), nullable=False) # IMAGE, FONT_FILE, CSS_STYLESHEET