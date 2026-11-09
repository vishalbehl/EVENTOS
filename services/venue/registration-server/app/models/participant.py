import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.ext.hybrid import hybrid_property

from app.database import Base

if TYPE_CHECKING:
    from app.models.event import Event
    from app.models.participant_role import ParticipantRole


class Participant(Base):
    __table_args__ = {"schema": "registration"}
    __tablename__ = "participants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    event_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("events.events.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    regno: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    first_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    last_name: Mapped[str] = mapped_column(String(150), nullable=False, default="")
    email: Mapped[Optional[str]] = mapped_column(String(320), nullable=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    
    role_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participant_roles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(50), nullable=False, default="Delegate")
    roles: Mapped[List[str]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    track_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    
    company: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    designation: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    
    approval_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Approved")
    paid_status: Mapped[str] = mapped_column(String(30), nullable=False, default="Unpaid")
    badge_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Unprinted")
    checkin_status: Mapped[str] = mapped_column(String(50), nullable=False, default="Pending")
    
    source: Mapped[str] = mapped_column(String(30), nullable=False, default="offline")
    qr_code_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    custom_fields: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    
    registered_at: Mapped[datetime] = mapped_column(
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
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    deleted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Relationships
    event: Mapped["Event"] = relationship("Event")
    role_rel: Mapped[Optional["ParticipantRole"]] = relationship("ParticipantRole", lazy="selectin")

    @hybrid_property
    def name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    @name.setter
    def name(self, val: str) -> None:
        if not val:
            return
        parts = val.strip().split(" ", 1)
        self.first_name = parts[0]
        self.last_name = parts[1] if len(parts) > 1 else ""

