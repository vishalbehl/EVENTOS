from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class TemplateInstallation(Base):
    """Tenant-owned installation of a marketplace template into one event.

    The marketplace catalogue tables are managed by their legacy SQL
    migrations and are not yet ORM-owned. Their identifiers therefore remain
    typed UUID references here without duplicating catalogue metadata.
    """

    __tablename__ = "template_installations"
    __table_args__ = (
        Index(
            "ix_rls_templates_template_installations_organization",
            "organization_id",
        ),
        Index(
            "ix_templates_template_installations_event_id",
            "event_id",
        ),
        {"schema": "operation_templates"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=False,
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    installed_version_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
    )
    installed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
