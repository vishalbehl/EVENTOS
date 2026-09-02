import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, String, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Kit(Base):
    __table_args__ = {"schema": "venue", "extend_existing": True}
    __tablename__ = "kits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    kit_name: Mapped[str] = mapped_column(String(150), nullable=False, unique=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="Delegate")
    total_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=1000)
    distributed_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_per_participant: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    target_roles: Mapped[dict] = mapped_column(JSONB, nullable=False, default=lambda: ["All"])
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


class ParticipantKit(Base):
    __table_args__ = {"schema": "venue", "extend_existing": True}
    __tablename__ = "participant_kits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    participant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("registration.participants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kit_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("venue.kits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Issued")
    issued_by: Mapped[str] = mapped_column(String(100), nullable=False, default="REG-DESK-01")
    
    issued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
