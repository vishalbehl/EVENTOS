import uuid
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy import Boolean, DateTime, ForeignKey, ForeignKeyConstraint, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin
from app.modules.registration.catalogue_limits import MAX_CATEGORY_KEY_LENGTH


class FormTemplate(Base, SoftDeleteMixin):
    """
    Form template blueprint.
    Global templates (scope_type="GLOBAL", organization_id=NULL) are created by Command Center.
    Organization custom templates (scope_type="ORGANIZATION") belong to an organization.
    """
    __tablename__ = "form_templates"
    __table_args__ = (
        UniqueConstraint("id", "organization_id", name="uq_form_template_owner"),
        {"schema": "design"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("design.form_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(String(150), nullable=False)
    slug: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # Established codes identify operational purpose, not the mutable category
    # slug. Unknown historical keys retain their legacy taxonomy projection.
    category_key: Mapped[str] = mapped_column(
        String(MAX_CATEGORY_KEY_LENGTH), nullable=False, default="registration", index=True
    )
    scope_type: Mapped[str] = mapped_column(
        String(20), nullable=False, default="GLOBAL", index=True
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Rich Drag-and-Drop Form Schema
    fields: Mapped[List[Dict[str, Any]]] = mapped_column(JSONB, nullable=False, default=list)
    settings: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    preview_image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    category: Mapped[Optional["FormCategory"]] = relationship(
        "FormCategory", back_populates="templates"
    )

    def __repr__(self) -> str:
        return f"<FormTemplate id={self.id} slug={self.slug} name={self.name} category={self.category_key}>"


class EventFormTemplateBinding(Base):
    """The one explicitly selected operational template for an event purpose."""
    __tablename__ = "event_form_template_bindings"
    __table_args__ = (
        UniqueConstraint("event_id", "purpose", name="uq_event_form_template_binding_purpose"),
        ForeignKeyConstraint(["event_id", "organization_id"],
            ["events.events.id", "events.events.organization_id"],
            name="fk_event_form_binding_event_owner", ondelete="CASCADE"),
        ForeignKeyConstraint(["template_id", "organization_id"],
            ["design.form_templates.id", "design.form_templates.organization_id"],
            name="fk_event_form_binding_template_owner", ondelete="RESTRICT"),
        {"schema": "design"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform.organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True)
    purpose: Mapped[str] = mapped_column(String(32), nullable=False)
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class FormTemplateReconciliation(Base):
    """Immutable evidence for catalogue validation and global retirement."""
    __tablename__ = "form_template_reconciliations"
    __table_args__ = (
        UniqueConstraint("template_id", "template_version", "operation",
            name="uq_form_template_reconciliation_version_operation"),
        {"schema": "design"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
        ForeignKey("design.form_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    replacement_template_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True),
        ForeignKey("design.form_templates.id", ondelete="RESTRICT"), nullable=True)
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    details: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
