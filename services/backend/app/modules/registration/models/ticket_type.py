import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Float, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base

if TYPE_CHECKING:
    from app.modules.events.models.event import Event


class TicketType(Base):
    """
    Conference role ticketing pricing tiers (pricing matrix).
    """
    __tablename__ = "ticket_types"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_name: Mapped[str] = mapped_column(String(100), nullable=False)
    tier_name: Mapped[str] = mapped_column(String(100), nullable=False)
    price: Mapped[float] = mapped_column(Float, nullable=False)

    __table_args__ = (
        UniqueConstraint('event_id', 'role_name', 'tier_name', name='_event_role_tier_uc'),
    )

    # Relationship
    event: Mapped["Event"] = relationship("Event")

    def __repr__(self) -> str:
        return f"<TicketType event_id={self.event_id} role={self.role_name} tier={self.tier_name} price={self.price}>"
