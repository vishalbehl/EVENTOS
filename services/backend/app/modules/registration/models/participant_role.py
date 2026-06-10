# backend/app/models/participant_role.py
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import TYPE_CHECKING, Optional

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event


class ParticipantRole(Base):
    """
    Configurable participant role / delegate type for each event.
    Seeded with platform-wide defaults when an event is created.
    """
    __tablename__ = "roles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    category: Mapped[str] = mapped_column(String(100), nullable=False, default="General")
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    role_code: Mapped[str] = mapped_column(String(10), nullable=False, default="REG")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    event: Mapped["Event"] = relationship("Event")

    def __repr__(self) -> str:
        return f"<ParticipantRole id={self.id} name={self.name} event_id={self.event_id}>"
