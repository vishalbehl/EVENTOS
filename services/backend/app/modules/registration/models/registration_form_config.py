import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import ForeignKey, String, DateTime, Boolean, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class RegistrationFormConfig(Base):
    """
    Configuration for public registration forms per event.
    Stores toggles for default fields and configurations for custom fields.
    """
    __tablename__ = "registration_forms"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    template_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.form_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    category_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.form_categories.id", ondelete="SET NULL"),
        nullable=True,
    )
    is_live: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    fields: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    settings: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    schema_version: Mapped[int] = mapped_column(nullable=False, default=1)
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

    # Relationships
    event = relationship("Event")
    template = relationship("FormTemplate")
    category = relationship("FormCategory")

    def __repr__(self) -> str:
        return f"<RegistrationFormConfig id={self.id} event_id={self.event_id} is_live={self.is_live}>"

