import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base, SoftDeleteMixin

if TYPE_CHECKING:
    from app.modules.events.models.event import Event


class EmailComponent(Base, SoftDeleteMixin):
    """
    Reusable email components (blocks) to be used in the Drag & Drop editor.
    e.g. Social block, Button block, Menu block.
    Can be global (event_id=NULL) or event-specific.
    """
    __tablename__ = "email_components"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # NULL = global component available to all events
    event_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    organization_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("platform.organizations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    scope_type: Mapped[str] = mapped_column(String(20), nullable=False, default="EVENT")
    component_kind: Mapped[str] = mapped_column(String(20), nullable=False, default="BLOCK")
    stable_key: Mapped[str] = mapped_column(String(100), nullable=False, default="custom")
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="saved")
    document_fragment: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    preview_metadata: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("identity.users.id", ondelete="SET NULL"),
        nullable=True,
    )

    # e.g., "social", "button", "divider", "text"
    component_type: Mapped[str] = mapped_column(String(100), nullable=False)
    # User-friendly name
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    
    # Store the default properties configuration as JSON
    # e.g. padding, colors, fonts, links
    default_config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    is_global: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

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

    # ── Relationships ─────────────────────────────────────
    event: Mapped[Optional["Event"]] = relationship(
        "Event"
    )

    def __repr__(self) -> str:
        return f"<EmailComponent id={self.id} name={self.name} type={self.component_type}>"
