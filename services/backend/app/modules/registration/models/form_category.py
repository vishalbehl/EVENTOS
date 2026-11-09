import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin


class FormCategory(Base, SoftDeleteMixin):
    """
    Form category model.
    System categories (is_system=True, organization_id=NULL) are global and protected
    from being renamed or deleted by organizers.
    Custom categories can be created by organizers for their organization.
    """
    __tablename__ = "form_categories"
    __table_args__ = {"schema": "design"}

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="ClipboardList")
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

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

    # Relationship to templates under this category
    templates: Mapped[List["FormTemplate"]] = relationship(
        "FormTemplate",
        back_populates="category",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<FormCategory id={self.id} slug={self.slug} name={self.name} is_system={self.is_system}>"


class FormCategoryReconciliation(Base):
    """Immutable evidence for category validation, repair, and retirement."""
    __tablename__ = "form_category_reconciliations"
    __table_args__ = (
        UniqueConstraint("category_id", "category_version", "operation",
            name="uq_form_category_reconciliation_version_operation"),
        {"schema": "design"},
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    category_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True),
        ForeignKey("design.form_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    replacement_category_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True),
        ForeignKey("design.form_categories.id", ondelete="RESTRICT"), nullable=True)
    category_version: Mapped[int] = mapped_column(Integer, nullable=False)
    operation: Mapped[str] = mapped_column(String(32), nullable=False)
    status: Mapped[str] = mapped_column(String(24), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    details: Mapped[Dict[str, Any]] = mapped_column(JSONB, nullable=False, default=dict)
    actor_user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc))
