import uuid
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event
    from app.modules.events.models.session import Session
    from app.modules.events.models.room import Room


class CapacityRule(Base):
    """
    Configures and enforces capacity boundaries at the Event, Session, or Room level.
    """
    __tablename__ = "capacity_rules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.sessions.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    room_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.rooms.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    capacity: Mapped[int] = mapped_column(Integer, nullable=False)
    waitlist_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auto_promote: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    priority_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Relationships
    event: Mapped["Event"] = relationship("Event")
    session: Mapped[Optional["Session"]] = relationship("Session")
    room: Mapped[Optional["Room"]] = relationship("Room")

    def __repr__(self) -> str:
        return f"<CapacityRule id={self.id} capacity={self.capacity}>"
