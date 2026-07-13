import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy import String, Text, DateTime, ForeignKey, Boolean, Integer, Numeric, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

class TemplateCategory(Base):
    __tablename__ = "template_categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)

class RoomTemplate(Base, SoftDeleteMixin):
    __tablename__ = "room_templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    short_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    consumables_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    inclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)

    # Specs
    default_capacity: Mapped[int] = mapped_column(Integer, default=150)
    room_type: Mapped[str] = mapped_column(String(100), default="Conference Room")
    podiums: Mapped[int] = mapped_column(Integer, default=0)
    setup_time: Mapped[float] = mapped_column(Numeric(10, 2), default=2.00)
    teardown_time: Mapped[float] = mapped_column(Numeric(10, 2), default=1.00)

    # Allocations
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
class RegistrationTemplate(Base, SoftDeleteMixin):
    __tablename__ = "registration_templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    short_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    consumables_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    inclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)

    # Specs
    registration_type: Mapped[str] = mapped_column(String(100), default="Onsite")
    min_attendees: Mapped[int] = mapped_column(Integer, default=1000)
    max_attendees: Mapped[int] = mapped_column(Integer, default=3000)
    recommended_reg_type: Mapped[str] = mapped_column(String(100), default="Conference")
    reg_counters: Mapped[int] = mapped_column(Integer, default=8)
    kiosks: Mapped[int] = mapped_column(Integer, default=4)
    badge_stations: Mapped[int] = mapped_column(Integer, default=4)
    qr_stations: Mapped[int] = mapped_column(Integer, default=8)
    helpdesk_counters: Mapped[int] = mapped_column(Integer, default=2)
    checkins_per_hour: Mapped[int] = mapped_column(Integer, default=600)
    badge_per_piece_cost: Mapped[float] = mapped_column(Numeric(10, 2), default=15.00)
    setup_time: Mapped[float] = mapped_column(Numeric(10, 2), default=2.00)
    teardown_time: Mapped[float] = mapped_column(Numeric(10, 2), default=1.00)
    is_single_kiosk: Mapped[bool] = mapped_column(Boolean, default=False)

    # Allocations
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
class SrrTemplate(Base, SoftDeleteMixin):
    __tablename__ = "srr_templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(50), default="v1.0")
    usage_count: Mapped[int] = mapped_column(Integer, default=0)
    short_description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    total_estimated_cost: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    consumables_cost: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    inclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)
    exclusions: Mapped[Optional[List[str]]] = mapped_column(JSONB, default=list)

    # Specs
    srr_type: Mapped[str] = mapped_column(String(100), default="Large")
    min_speakers: Mapped[int] = mapped_column(Integer, default=150)
    max_speakers: Mapped[int] = mapped_column(Integer, default=350)
    recommended_event_size: Mapped[str] = mapped_column(String(100), default="Large")
    preview_stations: Mapped[int] = mapped_column(Integer, default=16)
    checkin_counters: Mapped[int] = mapped_column(Integer, default=2)
    is_single_station: Mapped[bool] = mapped_column(Boolean, default=False)
    consultation_desks: Mapped[int] = mapped_column(Integer, default=1)
    printer_stations: Mapped[int] = mapped_column(Integer, default=1)
    speakers_per_hour: Mapped[int] = mapped_column(Integer, default=60)
    setup_time: Mapped[float] = mapped_column(Numeric(10, 2), default=3.00)
    teardown_time: Mapped[float] = mapped_column(Numeric(10, 2), default=2.00)

    # Allocations
    hardware_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    staff_allocation: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=list)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class Template(Base, SoftDeleteMixin):
    __tablename__ = "templates"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="SET NULL"), nullable=True)
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.template_categories.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    template_type: Mapped[str] = mapped_column(String(50), default="WEBSITE", index=True)
    status: Mapped[str] = mapped_column(String(50), default="DRAFT", index=True)
    visibility: Mapped[str] = mapped_column(String(50), default="PRIVATE", index=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_marketplace: Mapped[bool] = mapped_column(Boolean, default=False)
    current_version_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

class TemplateVersion(Base):
    __tablename__ = "template_versions"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    content: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    schema: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=dict)
    assets: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, default=dict)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    published_by: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)

class TemplateInstallation(Base):
    __tablename__ = "template_installations"
    __table_args__ = (
        Index("ix_rls_templates_template_installations_organization", "organization_id"),
        {"schema": "templates"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    event_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"))
    installed_version_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.template_versions.id", ondelete="CASCADE"))
    installed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class TemplateUsage(Base):
    __tablename__ = "template_usage"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("events.events.id", ondelete="SET NULL"), nullable=True)
    usage_type: Mapped[str] = mapped_column(String(100), nullable=False)
    used_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class TemplateReview(Base):
    __tablename__ = "template_reviews"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"))
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    review: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class MarketplaceListing(Base):
    __tablename__ = "marketplace_listings"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"), index=True)
    price: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class MarketplacePurchase(Base):
    __tablename__ = "marketplace_purchases"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    listing_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.marketplace_listings.id", ondelete="CASCADE"), index=True)
    organization_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"))
    price_paid: Mapped[float] = mapped_column(Numeric(12, 2), default=0.00)
    purchased_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

class MarketplaceFavorite(Base):
    __tablename__ = "marketplace_favorites"
    __table_args__ = {"schema": "templates"}

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="CASCADE"), index=True)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("templates.templates.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
