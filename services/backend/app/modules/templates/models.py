import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer, Numeric
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

class TemplateCategory(Base):
    __tablename__ = "template_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

class Template(Base, SoftDeleteMixin):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.template_categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    template_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True) # WEBSITE, REGISTRATION, BADGE, etc.
    status: Mapped[str] = mapped_column(String(50), default="DRAFT", index=True) # DRAFT, PUBLISHED, ARCHIVED, DEPRECATED
    visibility: Mapped[str] = mapped_column(String(50), default="PRIVATE", index=True) # PRIVATE, ORGANIZATION, PUBLIC, MARKETPLACE
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_marketplace: Mapped[bool] = mapped_column(Boolean, default=False)
    current_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class TemplateVersion(Base):
    __tablename__ = "template_versions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    content: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False)
    schema: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    assets: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    published_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)

class TemplateDependency(Base):
    __tablename__ = "template_dependencies"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    dependency_template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"))
    dependency_type: Mapped[str] = mapped_column(String(50), nullable=False) # REQUIRE, OPTIONAL

class TemplateInstallation(Base):
    __tablename__ = "template_installations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"))
    installed_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.template_versions.id", ondelete="CASCADE"))
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class TemplateUsage(Base):
    __tablename__ = "template_usage"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"))
    usage_type: Mapped[str] = mapped_column(String(100), nullable=False) # RENDER, LOAD, BUILD
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class TemplateReview(Base):
    __tablename__ = "template_reviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class TemplateMarketplaceCategory(Base):
    __tablename__ = "template_marketplace_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True) # ACTIVE, SUSPENDED, DELETED
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class MarketplacePurchase(Base):
    __tablename__ = "marketplace_purchases"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.marketplace_listings.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    price_paid: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class MarketplaceFavorite(Base):
    __tablename__ = "marketplace_favorites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
